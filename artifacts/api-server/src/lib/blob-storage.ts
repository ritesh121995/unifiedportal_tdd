import { logger } from "./logger";

const DEFAULT_CONTAINER_NAME = "tdddocuments";
const RAW_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING ??
  process.env.AZURE_STORAGE_CONNECTIONSTRING ??
  process.env.AZURE_BLOB_CONNECTION_STRING ??
  "";
const RAW_STORAGE_CONTAINER =
  process.env.AZURE_STORAGE_CONTAINER ?? DEFAULT_CONTAINER_NAME;
const MAX_UPLOAD_ATTEMPTS = 3;

let containerClientPromise: Promise<ContainerClient | null> | null = null;
let hasLoggedMissingConfig = false;
let hasLoggedMissingBlobSdk = false;
let lastBlobInitError: string | null = null;
let lastBlobUploadError: string | null = null;

export interface BlobStorageStatus {
  configured: boolean;
  containerName: string;
  connectionStringSource: "AZURE_STORAGE_CONNECTION_STRING" | "AZURE_STORAGE_CONNECTIONSTRING" | "AZURE_BLOB_CONNECTION_STRING" | "missing";
  lastInitError: string | null;
  lastUploadError: string | null;
}

type BlobContainerClient = {
  createIfNotExists: () => Promise<unknown>;
  getBlockBlobClient: (blobPath: string) => {
    url: string;
    upload: (
      body: string,
      contentLength: number,
      options: {
        blobHTTPHeaders: {
          blobContentType: string;
        };
      },
    ) => Promise<unknown>;
    uploadData: (
      content: Buffer,
      options: {
        blobHTTPHeaders: {
          blobContentType: string;
        };
      },
    ) => Promise<unknown>;
  };
};

type ContainerClient = BlobContainerClient;

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

const STORAGE_CONNECTION_STRING = normalizeEnvValue(RAW_STORAGE_CONNECTION_STRING);
const STORAGE_CONTAINER = normalizeEnvValue(RAW_STORAGE_CONTAINER) || DEFAULT_CONTAINER_NAME;

function resolveConnectionStringSource(): BlobStorageStatus["connectionStringSource"] {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return "AZURE_STORAGE_CONNECTION_STRING";
  }
  if (process.env.AZURE_STORAGE_CONNECTIONSTRING) {
    return "AZURE_STORAGE_CONNECTIONSTRING";
  }
  if (process.env.AZURE_BLOB_CONNECTION_STRING) {
    return "AZURE_BLOB_CONNECTION_STRING";
  }
  return "missing";
}

function looksLikeAuthorizationError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("not authorized") ||
    message.includes("authorizationpermissionmismatch") ||
    message.includes("authenticationfailed")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withUploadRetries(
  operationName: "upload-text" | "upload-buffer",
  blobPath: string,
  uploadOperation: () => Promise<void>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      await uploadOperation();
      return true;
    } catch (error) {
      if (looksLikeAuthorizationError(error)) {
        lastBlobUploadError =
          error instanceof Error ? error.message : "Authorization failed for blob upload";
        logger.error(
          { error, blobPath, operationName, attempt },
          "Blob upload authorization failed; not retrying",
        );
        return false;
      }
      const isLastAttempt = attempt === MAX_UPLOAD_ATTEMPTS;
      if (isLastAttempt) {
        lastBlobUploadError =
          error instanceof Error ? error.message : "Unknown blob upload error";
        logger.error(
          { error, blobPath, operationName, attempt },
          "Blob upload failed after retries",
        );
        return false;
      }
      const delayMs = 200 * attempt;
      lastBlobUploadError =
        error instanceof Error ? error.message : "Unknown blob upload error";
      logger.warn(
        { error, blobPath, operationName, attempt, delayMs },
        "Blob upload failed; retrying",
      );
      await wait(delayMs);
    }
  }
  return false;
}

async function loadBlobContainerClient(
  connectionString: string,
  containerName: string,
): Promise<ContainerClient | null> {
  try {
    const { BlobServiceClient } = await import("@azure/storage-blob");
    const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
    return serviceClient.getContainerClient(containerName);
  } catch (error) {
    lastBlobInitError = error instanceof Error ? error.message : "Unknown blob SDK load error";
    if (!hasLoggedMissingBlobSdk) {
      logger.error(
        { error },
        "Azure Blob SDK is unavailable at runtime; blob uploads disabled.",
      );
      hasLoggedMissingBlobSdk = true;
    }
    return null;
  }
}

async function getContainerClient(): Promise<ContainerClient | null> {
  if (containerClientPromise) {
    return containerClientPromise;
  }

  containerClientPromise = (async () => {
    if (!STORAGE_CONNECTION_STRING) {
      if (!hasLoggedMissingConfig) {
        logger.warn(
          "Blob storage disabled: no connection string is configured.",
        );
        hasLoggedMissingConfig = true;
      }
      lastBlobInitError = "Missing blob storage connection string";
      return null;
    }

    try {
      const containerClient = await loadBlobContainerClient(
        STORAGE_CONNECTION_STRING,
        STORAGE_CONTAINER,
      );
      if (!containerClient) {
        return null;
      }
      try {
        await containerClient.createIfNotExists();
      } catch (error) {
        // Some SAS-scoped credentials cannot create containers, but uploads
        // can still succeed if the container already exists.
        lastBlobInitError =
          error instanceof Error ? error.message : "Unable to create container";
        logger.warn(
          { error, containerName: STORAGE_CONTAINER },
          "Unable to create blob container automatically; continuing with existing container",
        );
      }
      lastBlobInitError = null;
      return containerClient;
    } catch (error) {
      lastBlobInitError = error instanceof Error ? error.message : "Unknown blob init error";
      logger.error({ error }, "Failed to initialize Azure Blob container client");
      return null;
    }
  })();

  return containerClientPromise;
}

export interface BlobUploadResult {
  blobPath: string;
  containerName: string;
  url: string;
}

export function getBlobStorageStatus(): BlobStorageStatus {
  return {
    configured: STORAGE_CONNECTION_STRING.length > 0,
    containerName: STORAGE_CONTAINER,
    connectionStringSource: resolveConnectionStringSource(),
    lastInitError: lastBlobInitError,
    lastUploadError: lastBlobUploadError,
  };
}

export async function uploadTextBlob(
  blobPath: string,
  content: string,
  contentType: string,
): Promise<BlobUploadResult | null> {
  const containerClient = await getContainerClient();
  if (!containerClient) {
    return null;
  }

  try {
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    const uploaded = await withUploadRetries(
      "upload-text",
      blobPath,
      async () => {
        await blockBlobClient.upload(content, Buffer.byteLength(content), {
          blobHTTPHeaders: {
            blobContentType: contentType,
          },
        });
      },
    );
    if (!uploaded) {
      return null;
    }
    lastBlobUploadError = null;

    return {
      blobPath,
      containerName: STORAGE_CONTAINER,
      url: blockBlobClient.url,
    };
  } catch (error) {
    lastBlobUploadError =
      error instanceof Error ? error.message : "Unknown markdown upload error";
    logger.error({ error, blobPath }, "Failed to upload markdown to Azure Blob");
    return null;
  }
}

export async function uploadBufferBlob(
  blobPath: string,
  content: Buffer,
  contentType: string,
): Promise<BlobUploadResult | null> {
  const containerClient = await getContainerClient();
  if (!containerClient) {
    return null;
  }

  try {
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    const uploaded = await withUploadRetries(
      "upload-buffer",
      blobPath,
      async () => {
        await blockBlobClient.uploadData(content, {
          blobHTTPHeaders: {
            blobContentType: contentType,
          },
        });
      },
    );
    if (!uploaded) {
      return null;
    }
    lastBlobUploadError = null;

    return {
      blobPath,
      containerName: STORAGE_CONTAINER,
      url: blockBlobClient.url,
    };
  } catch (error) {
    lastBlobUploadError =
      error instanceof Error ? error.message : "Unknown file upload error";
    logger.error({ error, blobPath }, "Failed to upload file to Azure Blob");
    return null;
  }
}


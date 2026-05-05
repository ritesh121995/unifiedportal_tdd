import type { FormDraft } from "@/store/app-context";

export interface TerraformContext {
  appName: string;
  appShort: string;
  region: string;
  businessUnit: string;
  prefix: string;
  env: string;
}

function makeCtx(formData: FormDraft): TerraformContext {
  const appName = formData.applicationName ?? "demo-app";
  const appShort = appName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "app";
  const region = (formData.azureRegions?.[0] ?? "canadacentral")
    .toLowerCase()
    .replace(/\s+/g, "");
  const businessUnit = (
    ((formData as Record<string, unknown>)["lineOfBusiness"] as string) ??
    formData.organization ??
    "CCoE"
  )
    .replace(/[^a-zA-Z0-9 \-_]/g, "")
    .trim();
  return { appName, appShort, region, businessUnit, prefix: "mf", env: "demo" };
}

const HEADER = (ctx: TerraformContext, services: string[]) => `# =============================================================
# McCain Foods CCoE — Demo IaC Configuration
# Application : ${ctx.appName}
# Environment : ${ctx.env.toUpperCase()} (NON-PRODUCTION — demonstration only)
# Region      : ${ctx.region}
# Services    : ${services.join(", ")}
# Generated   : ${new Date().toISOString().slice(0, 10)}
# =============================================================

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.110"
    }
  }
  required_version = ">= 1.7.0"
}

provider "azurerm" {
  features {}
}

# ─── Locals ────────────────────────────────────────────────────────────────
locals {
  prefix      = "${ctx.prefix}"
  app_short   = "${ctx.appShort}"
  environment = "${ctx.env}"
  location    = "${ctx.region}"

  tags = {
    Application  = "${ctx.appName}"
    Environment  = "${ctx.env}"
    Owner        = "CCoE-Platform"
    BusinessUnit = "${ctx.businessUnit}"
    ManagedBy    = "Terraform"
    CostCenter   = "${ctx.businessUnit}"
    Repo         = "mccain-iac-demo"
  }
}

# ─── Resource Group ────────────────────────────────────────────────────────
resource "azurerm_resource_group" "main" {
  name     = "\${local.prefix}-\${local.app_short}-\${local.environment}-rg"
  location = local.location
  tags     = local.tags
}`;

const VNET_BLOCK = () => `
# ─── Networking (VNet + Subnet + NSG) ─────────────────────────────────────
resource "azurerm_virtual_network" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-vnet"
  address_space       = ["10.100.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_subnet" "default" {
  name                 = "default-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.100.1.0/24"]
}

resource "azurerm_network_security_group" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_subnet_network_security_group_association" "main" {
  subnet_id                 = azurerm_subnet.default.id
  network_security_group_id = azurerm_network_security_group.main.id
}`;

const SERVICE_BLOCKS: Record<string, (ctx: TerraformContext) => string> = {
  vm: (ctx) => `
# ─── Virtual Machine ───────────────────────────────────────────────────────
resource "azurerm_public_ip" "vm" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-pip"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_network_interface" "vm" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-nic"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.default.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.vm.id
  }
}

resource "azurerm_windows_virtual_machine" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-vm"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  size                = "Standard_B2s"
  admin_username      = "mccainadmin"
  admin_password      = var.vm_admin_password
  tags                = local.tags

  network_interface_ids = [azurerm_network_interface.vm.id]

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
    disk_size_gb         = 128
  }

  source_image_reference {
    publisher = "MicrosoftWindowsServer"
    offer     = "WindowsServer"
    sku       = "2022-datacenter-azure-edition"
    version   = "latest"
  }
}

variable "vm_admin_password" {
  description = "Admin password for the Windows VM"
  type        = string
  sensitive   = true
}

output "vm_public_ip" {
  value = azurerm_public_ip.vm.ip_address
}`,

  app_service: () => `
# ─── App Service ──────────────────────────────────────────────────────────
resource "azurerm_service_plan" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-asp"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "B2"
  tags                = local.tags
}

resource "azurerm_linux_web_app" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-app"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_service_plan.main.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true
  tags                = local.tags

  site_config {
    minimum_tls_version = "1.2"
    application_stack {
      node_version = "20-lts"
    }
  }

  identity {
    type = "SystemAssigned"
  }
}

output "app_service_url" {
  value = "https://\${azurerm_linux_web_app.main.default_hostname}"
}`,

  function_app: () => `
# ─── Function App ─────────────────────────────────────────────────────────
resource "azurerm_storage_account" "func" {
  name                     = "\${local.prefix}\${local.app_short}funcsa"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  tags                     = local.tags
}

resource "azurerm_service_plan" "func" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-func-asp"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1"
  tags                = local.tags
}

resource "azurerm_linux_function_app" "main" {
  name                       = "\${local.prefix}-\${local.app_short}-\${local.environment}-func"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  service_plan_id            = azurerm_service_plan.func.id
  storage_account_name       = azurerm_storage_account.func.name
  storage_account_access_key = azurerm_storage_account.func.primary_access_key
  tags                       = local.tags
  https_only                 = true

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  identity {
    type = "SystemAssigned"
  }
}

output "function_app_url" {
  value = "https://\${azurerm_linux_function_app.main.default_hostname}"
}`,

  aks: () => `
# ─── Kubernetes Service (AKS) ─────────────────────────────────────────────
resource "azurerm_kubernetes_cluster" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-aks"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "\${local.prefix}-\${local.app_short}-aks"
  tags                = local.tags

  default_node_pool {
    name           = "system"
    node_count     = 2
    vm_size        = "Standard_D2_v3"
    vnet_subnet_id = azurerm_subnet.default.id
    tags           = local.tags
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }
}

output "aks_kube_config" {
  value     = azurerm_kubernetes_cluster.main.kube_config_raw
  sensitive = true
}`,

  container_instance: () => `
# ─── Container Instance ───────────────────────────────────────────────────
resource "azurerm_container_group" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-aci"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "Public"
  dns_name_label      = "\${local.prefix}-\${local.app_short}-\${local.environment}"
  os_type             = "Linux"
  tags                = local.tags

  container {
    name   = "app"
    image  = "mcr.microsoft.com/azuredocs/aci-helloworld"
    cpu    = "0.5"
    memory = "1.5"

    ports {
      port     = 80
      protocol = "TCP"
    }
  }
}

output "container_instance_fqdn" {
  value = azurerm_container_group.main.fqdn
}`,

  vmss: () => `
# ─── VM Scale Set ─────────────────────────────────────────────────────────
resource "azurerm_windows_virtual_machine_scale_set" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-vmss"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard_B2s"
  instances           = 2
  admin_username      = "mccainadmin"
  admin_password      = var.vm_admin_password
  tags                = local.tags

  source_image_reference {
    publisher = "MicrosoftWindowsServer"
    offer     = "WindowsServer"
    sku       = "2022-datacenter-azure-edition"
    version   = "latest"
  }

  os_disk {
    storage_account_type = "Premium_LRS"
    caching              = "ReadWrite"
  }

  network_interface {
    name    = "nic"
    primary = true

    ip_configuration {
      name      = "internal"
      primary   = true
      subnet_id = azurerm_subnet.default.id
    }
  }
}`,

  sql_database: () => `
# ─── Azure SQL Database ───────────────────────────────────────────────────
resource "azurerm_mssql_server" "main" {
  name                         = "\${local.prefix}-\${local.app_short}-\${local.environment}-sql"
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location
  version                      = "12.0"
  administrator_login          = "sqladmin"
  administrator_login_password = var.sql_admin_password
  minimum_tls_version          = "1.2"
  tags                         = local.tags

  azuread_administrator {
    login_username = "AzureAD Admin"
    object_id      = var.sql_aad_admin_object_id
  }
}

resource "azurerm_mssql_database" "main" {
  name         = "\${local.prefix}-\${local.app_short}-\${local.environment}-db"
  server_id    = azurerm_mssql_server.main.id
  collation    = "SQL_Latin1_General_CP1_CI_AS"
  sku_name     = "S1"
  license_type = "LicenseIncluded"
  tags         = local.tags
}

variable "sql_admin_password" {
  type      = string
  sensitive = true
}

variable "sql_aad_admin_object_id" {
  type        = string
  description = "Object ID of the AAD group or user to set as SQL admin"
}`,

  cosmos_db: () => `
# ─── Cosmos DB ────────────────────────────────────────────────────────────
resource "azurerm_cosmosdb_account" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-cosmos"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  tags                = local.tags

  consistency_policy {
    consistency_level       = "Session"
    max_interval_in_seconds = 5
    max_staleness_prefix    = 100
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  capabilities {
    name = "EnableServerless"
  }
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "app-db"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}`,

  storage_account: () => `
# ─── Storage Account ──────────────────────────────────────────────────────
resource "azurerm_storage_account" "main" {
  name                     = "\${local.prefix}\${local.app_short}\${local.environment}sa"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "ZRS"
  min_tls_version          = "TLS1_2"
  tags                     = local.tags

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 7
    }
  }
}

resource "azurerm_storage_container" "app" {
  name                  = "app-data"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}`,

  redis_cache: () => `
# ─── Redis Cache ──────────────────────────────────────────────────────────
resource "azurerm_redis_cache" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-redis"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  capacity            = 1
  family              = "C"
  sku_name            = "Standard"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
  tags                = local.tags
}

output "redis_hostname" {
  value = azurerm_redis_cache.main.hostname
}`,

  postgresql: () => `
# ─── Azure Database for PostgreSQL ────────────────────────────────────────
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "\${local.prefix}-\${local.app_short}-\${local.environment}-pg"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "15"
  administrator_login    = "pgadmin"
  administrator_password = var.pg_admin_password
  storage_mb             = 32768
  sku_name               = "B_Standard_B2s"
  tags                   = local.tags
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = "appdb"
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

variable "pg_admin_password" {
  type      = string
  sensitive = true
}`,

  mysql: () => `
# ─── Azure Database for MySQL ─────────────────────────────────────────────
resource "azurerm_mysql_flexible_server" "main" {
  name                   = "\${local.prefix}-\${local.app_short}-\${local.environment}-mysql"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  administrator_login    = "mysqladmin"
  administrator_password = var.mysql_admin_password
  sku_name               = "B_Standard_B2s"
  version                = "8.0.21"
  tags                   = local.tags
}

variable "mysql_admin_password" {
  type      = string
  sensitive = true
}`,

  synapse: () => `
# ─── Azure Synapse Analytics ──────────────────────────────────────────────
resource "azurerm_synapse_workspace" "main" {
  name                                 = "\${local.prefix}-\${local.app_short}-\${local.environment}-syn"
  resource_group_name                  = azurerm_resource_group.main.name
  location                             = azurerm_resource_group.main.location
  storage_data_lake_gen2_filesystem_id = azurerm_storage_data_lake_gen2_filesystem.synapse.id
  sql_administrator_login              = "synapseadmin"
  sql_administrator_login_password     = var.synapse_admin_password
  tags                                 = local.tags

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_storage_account" "synapse" {
  name                     = "\${local.prefix}\${local.app_short}synsa"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  is_hns_enabled           = true
  tags                     = local.tags
}

resource "azurerm_storage_data_lake_gen2_filesystem" "synapse" {
  name               = "synapsefs"
  storage_account_id = azurerm_storage_account.synapse.id
}

variable "synapse_admin_password" {
  type      = string
  sensitive = true
}`,

  data_factory: () => `
# ─── Azure Data Factory ───────────────────────────────────────────────────
resource "azurerm_data_factory" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-adf"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags

  identity {
    type = "SystemAssigned"
  }
}`,

  application_gateway: () => `
# ─── Application Gateway (WAF v2) ─────────────────────────────────────────
resource "azurerm_subnet" "agw" {
  name                 = "agw-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.100.2.0/24"]
}

resource "azurerm_public_ip" "agw" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-agw-pip"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_application_gateway" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-agw"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.tags

  sku {
    name     = "WAF_v2"
    tier     = "WAF_v2"
    capacity = 2
  }

  gateway_ip_configuration {
    name      = "gw-ip-config"
    subnet_id = azurerm_subnet.agw.id
  }

  frontend_port { name = "http"; port = 80 }
  frontend_port { name = "https"; port = 443 }

  frontend_ip_configuration {
    name                 = "public-fip"
    public_ip_address_id = azurerm_public_ip.agw.id
  }

  backend_address_pool { name = "backend-pool" }

  backend_http_settings {
    name                  = "backend-settings"
    cookie_based_affinity = "Disabled"
    port                  = 80
    protocol              = "Http"
    request_timeout       = 60
  }

  http_listener {
    name                           = "http-listener"
    frontend_ip_configuration_name = "public-fip"
    frontend_port_name             = "http"
    protocol                       = "Http"
  }

  request_routing_rule {
    name                       = "routing-rule"
    rule_type                  = "Basic"
    priority                   = 10
    http_listener_name         = "http-listener"
    backend_address_pool_name  = "backend-pool"
    backend_http_settings_name = "backend-settings"
  }

  waf_configuration {
    enabled          = true
    firewall_mode    = "Prevention"
    rule_set_version = "3.2"
  }
}`,

  load_balancer: () => `
# ─── Load Balancer ────────────────────────────────────────────────────────
resource "azurerm_public_ip" "lb" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-lb-pip"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_lb" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-lb"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Standard"
  tags                = local.tags

  frontend_ip_configuration {
    name                 = "public-fip"
    public_ip_address_id = azurerm_public_ip.lb.id
  }
}

resource "azurerm_lb_backend_address_pool" "main" {
  loadbalancer_id = azurerm_lb.main.id
  name            = "backend-pool"
}

resource "azurerm_lb_probe" "http" {
  loadbalancer_id = azurerm_lb.main.id
  name            = "http-probe"
  protocol        = "Http"
  port            = 80
  request_path    = "/health"
}

resource "azurerm_lb_rule" "http" {
  loadbalancer_id                = azurerm_lb.main.id
  name                           = "http-rule"
  protocol                       = "Tcp"
  frontend_port                  = 80
  backend_port                   = 80
  frontend_ip_configuration_name = "public-fip"
  backend_address_pool_ids       = [azurerm_lb_backend_address_pool.main.id]
  probe_id                       = azurerm_lb_probe.http.id
}`,

  front_door: () => `
# ─── Azure Front Door ─────────────────────────────────────────────────────
resource "azurerm_cdn_frontdoor_profile" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-afd"
  resource_group_name = azurerm_resource_group.main.name
  sku_name            = "Standard_AzureFrontDoor"
  tags                = local.tags
}

resource "azurerm_cdn_frontdoor_endpoint" "main" {
  name                     = "\${local.prefix}-\${local.app_short}-\${local.environment}"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  tags                     = local.tags
}`,

  private_endpoint: () => `
# ─── Private Endpoints ────────────────────────────────────────────────────
resource "azurerm_subnet" "pe" {
  name                 = "pe-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.100.3.0/24"]
}

resource "azurerm_private_dns_zone" "app" {
  name                = "privatelink.azurewebsites.net"
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "app" {
  name                  = "app-dns-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.app.name
  virtual_network_id    = azurerm_virtual_network.main.id
  tags                  = local.tags
}`,

  dns_zone: () => `
# ─── DNS Zone ─────────────────────────────────────────────────────────────
resource "azurerm_dns_zone" "main" {
  name                = "\${local.prefix}\${local.app_short}.mccain.internal"
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}`,

  api_management: () => `
# ─── API Management ───────────────────────────────────────────────────────
resource "azurerm_api_management" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-apim"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  publisher_name      = "McCain Foods CCoE"
  publisher_email     = "ccoe@mccain.com"
  sku_name            = "Developer_1"
  tags                = local.tags

  identity {
    type = "SystemAssigned"
  }
}

output "apim_gateway_url" {
  value = azurerm_api_management.main.gateway_url
}`,

  service_bus: () => `
# ─── Service Bus ──────────────────────────────────────────────────────────
resource "azurerm_servicebus_namespace" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-sb"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_servicebus_queue" "main" {
  name         = "app-queue"
  namespace_id = azurerm_servicebus_namespace.main.id

  enable_partitioning = true
  max_size_in_megabytes = 1024
  default_message_ttl   = "P14D"
}

resource "azurerm_servicebus_topic" "main" {
  name         = "app-events"
  namespace_id = azurerm_servicebus_namespace.main.id
}`,

  event_hub: () => `
# ─── Event Hub ────────────────────────────────────────────────────────────
resource "azurerm_eventhub_namespace" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-evhns"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Standard"
  capacity            = 1
  tags                = local.tags
}

resource "azurerm_eventhub" "main" {
  name                = "app-events"
  namespace_name      = azurerm_eventhub_namespace.main.name
  resource_group_name = azurerm_resource_group.main.name
  partition_count     = 4
  message_retention   = 7
}

resource "azurerm_eventhub_consumer_group" "app" {
  name                = "app-consumer-group"
  namespace_name      = azurerm_eventhub_namespace.main.name
  eventhub_name       = azurerm_eventhub.main.name
  resource_group_name = azurerm_resource_group.main.name
}`,

  event_grid: () => `
# ─── Event Grid ───────────────────────────────────────────────────────────
resource "azurerm_eventgrid_topic" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-egt"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}`,

  logic_apps: () => `
# ─── Logic Apps ───────────────────────────────────────────────────────────
resource "azurerm_logic_app_workflow" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-logic"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags

  identity {
    type = "SystemAssigned"
  }
}`,

  key_vault: () => `
# ─── Key Vault ────────────────────────────────────────────────────────────
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                        = "\${local.prefix}-\${local.app_short}-\${local.environment}-kv"
  location                    = azurerm_resource_group.main.location
  resource_group_name         = azurerm_resource_group.main.name
  enabled_for_disk_encryption = false
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days  = 90
  purge_protection_enabled    = true
  sku_name                    = "standard"
  tags                        = local.tags

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions      = ["Get", "List", "Set", "Delete", "Purge"]
    key_permissions         = ["Get", "List", "Create", "Delete", "Purge"]
    certificate_permissions = ["Get", "List", "Create", "Delete", "Purge"]
  }
}`,

  managed_identity: () => `
# ─── User-Assigned Managed Identity ──────────────────────────────────────
resource "azurerm_user_assigned_identity" "app" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-id"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.tags
}`,

  defender: () => `
# ─── Microsoft Defender for Cloud ─────────────────────────────────────────
resource "azurerm_security_center_subscription_pricing" "vms" {
  tier          = "Standard"
  resource_type = "VirtualMachines"
}

resource "azurerm_security_center_subscription_pricing" "sql" {
  tier          = "Standard"
  resource_type = "SqlServers"
}

resource "azurerm_security_center_subscription_pricing" "storage" {
  tier          = "Standard"
  resource_type = "StorageAccounts"
}`,

  sentinel: () => `
# ─── Microsoft Sentinel ───────────────────────────────────────────────────
resource "azurerm_sentinel_log_analytics_workspace_onboarding" "main" {
  workspace_id = azurerm_log_analytics_workspace.main.id
}`,

  application_insights: () => `
# ─── Application Insights ─────────────────────────────────────────────────
resource "azurerm_application_insights" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-ai"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  retention_in_days   = 90
  tags                = local.tags
}

output "appinsights_instrumentation_key" {
  value     = azurerm_application_insights.main.instrumentation_key
  sensitive = true
}`,

  log_analytics: () => `
# ─── Log Analytics Workspace ──────────────────────────────────────────────
resource "azurerm_log_analytics_workspace" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-law"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 90
  tags                = local.tags
}`,

  azure_monitor: () => `
# ─── Azure Monitor – Action Group & Alert ─────────────────────────────────
resource "azurerm_monitor_action_group" "ccoe" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-ag"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "ccoe-ops"
  tags                = local.tags

  email_receiver {
    name          = "CCoE-Ops"
    email_address = "ccoe-ops@mccain.com"
  }
}

resource "azurerm_monitor_metric_alert" "cpu" {
  name                = "\${local.prefix}-\${local.app_short}-cpu-alert"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_resource_group.main.id]
  description         = "CPU usage exceeded 85%"
  tags                = local.tags

  criteria {
    metric_namespace = "Microsoft.Compute/virtualMachines"
    metric_name      = "Percentage CPU"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  action {
    action_group_id = azurerm_monitor_action_group.ccoe.id
  }
}`,

  acr: () => `
# ─── Container Registry ───────────────────────────────────────────────────
resource "azurerm_container_registry" "main" {
  name                = "\${local.prefix}\${local.app_short}\${local.environment}acr"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard"
  admin_enabled       = false
  tags                = local.tags

  identity {
    type = "SystemAssigned"
  }
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}`,

  container_apps: () => `
# ─── Container Apps ───────────────────────────────────────────────────────
resource "azurerm_container_app_environment" "main" {
  name                       = "\${local.prefix}-\${local.app_short}-\${local.environment}-cae"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = local.tags
}

resource "azurerm_container_app" "main" {
  name                         = "\${local.prefix}-\${local.app_short}-app"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = local.tags

  template {
    container {
      name   = "app"
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 80
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}`,

  cognitive_services: () => `
# ─── Azure AI / Cognitive Services ───────────────────────────────────────
resource "azurerm_cognitive_account" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-ai"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  kind                = "CognitiveServices"
  sku_name            = "S0"
  tags                = local.tags

  identity {
    type = "SystemAssigned"
  }
}`,

  ml_workspace: () => `
# ─── Azure Machine Learning ───────────────────────────────────────────────
resource "azurerm_machine_learning_workspace" "main" {
  name                    = "\${local.prefix}-\${local.app_short}-\${local.environment}-aml"
  location                = azurerm_resource_group.main.location
  resource_group_name     = azurerm_resource_group.main.name
  application_insights_id = azurerm_application_insights.main.id
  key_vault_id            = azurerm_key_vault.main.id
  storage_account_id      = azurerm_storage_account.main.id
  tags                    = local.tags

  identity {
    type = "SystemAssigned"
  }
}`,

  static_web_app: () => `
# ─── Static Web App ───────────────────────────────────────────────────────
resource "azurerm_static_web_app" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-swa"
  resource_group_name = azurerm_resource_group.main.name
  location            = "canadacentral"
  sku_tier            = "Standard"
  sku_size            = "Standard"
  tags                = local.tags
}

output "static_web_app_url" {
  value = azurerm_static_web_app.main.default_host_name
}`,

  cdn: () => `
# ─── Azure CDN ────────────────────────────────────────────────────────────
resource "azurerm_cdn_profile" "main" {
  name                = "\${local.prefix}-\${local.app_short}-\${local.environment}-cdn"
  location            = "global"
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Standard_Microsoft"
  tags                = local.tags
}`,
};

const NEEDS_VNET = new Set([
  "vm", "vmss", "aks", "container_instance", "application_gateway",
  "load_balancer", "private_endpoint",
]);

export function generateMultiServiceTerraform(
  formData: FormDraft,
  selectedServiceIds: string[]
): string {
  const ctx = makeCtx(formData);
  const parts: string[] = [HEADER(ctx, selectedServiceIds)];

  const needsVnet =
    selectedServiceIds.some((id) => NEEDS_VNET.has(id)) ||
    selectedServiceIds.includes("vnet");

  if (needsVnet) {
    parts.push(VNET_BLOCK());
  }

  for (const id of selectedServiceIds) {
    if (id === "vnet") continue;
    const gen = SERVICE_BLOCKS[id];
    if (gen) parts.push(gen(ctx));
  }

  return parts.join("\n");
}

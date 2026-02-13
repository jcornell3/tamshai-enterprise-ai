# =============================================================================
# Fetch GitHub Variables for Terraform (Port Configuration)
# =============================================================================
#
# This script fetches port configuration variables from GitHub Variables.
# Unlike secrets, these are non-sensitive and can be fetched directly.
#
# Input (JSON from stdin):
#   { "environment": "dev" }
#
# Output (JSON to stdout):
#   { "port_caddy_http": "8090", "port_caddy_https": "8443", ... }
#
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"

# Read JSON input from stdin
$inputJson = [Console]::In.ReadToEnd()
$inputData = $inputJson | ConvertFrom-Json

$environment = $inputData.environment.ToUpper()

# Define all port variables with their GitHub variable names and defaults
$portVariables = @{
    # Infrastructure
    "port_caddy_http"          = @{ name = "${environment}_PG_CADDY_HTTP"; default = "8090" }
    "port_caddy_https"         = @{ name = "${environment}_PG_CADDY_HTTPS"; default = "8443" }
    "port_keycloak"            = @{ name = "${environment}_PG_KEYCLOAK"; default = "8190" }
    "port_kong_proxy"          = @{ name = "${environment}_PG_KONG_PROXY"; default = "8110" }
    "port_kong_admin"          = @{ name = "${environment}_PG_KONG_ADMIN"; default = "8111" }
    "port_vault"               = @{ name = "${environment}_PG_VAULT"; default = "8210" }

    # Databases
    "port_postgres"            = @{ name = "${environment}_PG_POSTGRES"; default = "5443" }
    "port_mongodb"             = @{ name = "${environment}_PG_MONGODB"; default = "27028" }
    "port_redis"               = @{ name = "${environment}_PG_REDIS"; default = "6390" }
    "port_elasticsearch"       = @{ name = "${environment}_PG_ELASTICSEARCH"; default = "9211" }
    "port_minio_api"           = @{ name = "${environment}_PG_MINIO_API"; default = "9110" }
    "port_minio_console"       = @{ name = "${environment}_PG_MINIO_CONSOLE"; default = "9112" }

    # MCP Services
    "port_mcp_gateway"         = @{ name = "${environment}_PG_MCP_GATEWAY"; default = "3110" }
    "port_mcp_hr"              = @{ name = "${environment}_PG_MCP_HR"; default = "3111" }
    "port_mcp_finance"         = @{ name = "${environment}_PG_MCP_FINANCE"; default = "3112" }
    "port_mcp_sales"           = @{ name = "${environment}_PG_MCP_SALES"; default = "3113" }
    "port_mcp_support"         = @{ name = "${environment}_PG_MCP_SUPPORT"; default = "3114" }
    "port_mcp_journey"         = @{ name = "${environment}_PG_MCP_JOURNEY"; default = "3115" }
    "port_mcp_payroll"         = @{ name = "${environment}_PG_MCP_PAYROLL"; default = "3116" }
    "port_mcp_tax"             = @{ name = "${environment}_PG_MCP_TAX"; default = "3117" }
    "port_mcp_ui"              = @{ name = "${environment}_PG_MCP_UI"; default = "3118" }

    # Web Apps
    "port_web_portal"          = @{ name = "${environment}_PG_WEB_PORTAL"; default = "4010" }
    "port_web_hr"              = @{ name = "${environment}_PG_WEB_HR"; default = "4011" }
    "port_web_finance"         = @{ name = "${environment}_PG_WEB_FINANCE"; default = "4012" }
    "port_web_sales"           = @{ name = "${environment}_PG_WEB_SALES"; default = "4013" }
    "port_web_support"         = @{ name = "${environment}_PG_WEB_SUPPORT"; default = "4014" }
    "port_web_payroll"         = @{ name = "${environment}_PG_WEB_PAYROLL"; default = "4015" }
    "port_web_tax"             = @{ name = "${environment}_PG_WEB_TAX"; default = "4016" }
    "port_web_customer_support"= @{ name = "${environment}_PG_WEB_CUSTOMER_SUPPORT"; default = "4017" }
    "port_website"             = @{ name = "${environment}_PG_WEBSITE"; default = "8085" }
}

# Initialize output with defaults
$output = @{}
foreach ($key in $portVariables.Keys) {
    $output[$key] = $portVariables[$key].default
}

try {
    # Fetch all GitHub variables in one call
    $variablesJson = gh variable list --json name,value 2>$null

    if ($variablesJson) {
        $variables = $variablesJson | ConvertFrom-Json

        # Create a lookup hashtable for quick access
        $varLookup = @{}
        foreach ($var in $variables) {
            $varLookup[$var.name] = $var.value
        }

        # Map GitHub variables to output
        foreach ($key in $portVariables.Keys) {
            $ghVarName = $portVariables[$key].name
            if ($varLookup.ContainsKey($ghVarName)) {
                $output[$key] = $varLookup[$ghVarName]
            }
        }
    }
} catch {
    # On error, defaults are already set - continue silently
}

# Output JSON (must be valid JSON for Terraform external data source)
$output | ConvertTo-Json -Compress

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
#   { "port_caddy_http": "80", "port_caddy_https": "443", ... }
#
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"

# Read JSON input from stdin
$inputJson = [Console]::In.ReadToEnd()
$inputData = $inputJson | ConvertFrom-Json

$environment = $inputData.environment.ToUpper()

# Use JCORNELL_GH_TOKEN if available (repo owner token)
if ($env:JCORNELL_GH_TOKEN) {
    $env:GH_TOKEN = $env:JCORNELL_GH_TOKEN
}

# Define all port variables with their GitHub variable names and defaults
$portVariables = @{
    # Infrastructure
    "port_caddy_http"          = @{ name = "${environment}_CADDY_HTTP"; default = "80" }
    "port_caddy_https"         = @{ name = "${environment}_CADDY_HTTPS"; default = "443" }
    "port_keycloak"            = @{ name = "${environment}_KEYCLOAK"; default = "8180" }
    "port_kong_proxy"          = @{ name = "${environment}_KONG_PROXY"; default = "8100" }
    "port_kong_admin"          = @{ name = "${environment}_KONG_ADMIN"; default = "8101" }
    "port_vault"               = @{ name = "${environment}_VAULT"; default = "8200" }

    # Databases
    "port_postgres"            = @{ name = "${environment}_POSTGRES"; default = "5433" }
    "port_mongodb"             = @{ name = "${environment}_MONGODB"; default = "27018" }
    "port_redis"               = @{ name = "${environment}_REDIS"; default = "6380" }
    "port_elasticsearch"       = @{ name = "${environment}_ELASTICSEARCH"; default = "9201" }
    "port_minio_api"           = @{ name = "${environment}_MINIO_API"; default = "9100" }
    "port_minio_console"       = @{ name = "${environment}_MINIO_CONSOLE"; default = "9102" }

    # MCP Services
    "port_mcp_gateway"         = @{ name = "${environment}_MCP_GATEWAY"; default = "3100" }
    "port_mcp_hr"              = @{ name = "${environment}_MCP_HR"; default = "3101" }
    "port_mcp_finance"         = @{ name = "${environment}_MCP_FINANCE"; default = "3102" }
    "port_mcp_sales"           = @{ name = "${environment}_MCP_SALES"; default = "3103" }
    "port_mcp_support"         = @{ name = "${environment}_MCP_SUPPORT"; default = "3104" }
    "port_mcp_journey"         = @{ name = "${environment}_MCP_JOURNEY"; default = "3105" }
    "port_mcp_payroll"         = @{ name = "${environment}_MCP_PAYROLL"; default = "3106" }
    "port_mcp_tax"             = @{ name = "${environment}_MCP_TAX"; default = "3117" }
    "port_mcp_ui"              = @{ name = "${environment}_MCP_UI"; default = "3118" }

    # Web Apps
    "port_web_portal"          = @{ name = "${environment}_WEB_PORTAL"; default = "4000" }
    "port_web_hr"              = @{ name = "${environment}_WEB_HR"; default = "4001" }
    "port_web_finance"         = @{ name = "${environment}_WEB_FINANCE"; default = "4002" }
    "port_web_sales"           = @{ name = "${environment}_WEB_SALES"; default = "4003" }
    "port_web_support"         = @{ name = "${environment}_WEB_SUPPORT"; default = "4004" }
    "port_web_payroll"         = @{ name = "${environment}_WEB_PAYROLL"; default = "4005" }
    "port_web_tax"             = @{ name = "${environment}_WEB_TAX"; default = "4006" }
    "port_web_customer_support"= @{ name = "${environment}_WEB_CUSTOMER_SUPPORT"; default = "4007" }
    "port_website"             = @{ name = "${environment}_WEBSITE"; default = "8080" }
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

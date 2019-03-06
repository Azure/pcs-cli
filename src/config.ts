export class Config {
    public KeyVaultName: string;
    public AADTenantId: string;
    public AADLoginURL: string;
    public AuthIssuerURL: string;
    public ApplicationId: string;
    public AzureStorageConnectionString: string;
    public SubscriptionId: string;
    public SolutionName: string;
    public IotHubName: string;
    public DockerTag: string;
    public DNS: string;
    public IoTHubConnectionString: string;
    public LoadBalancerIP: string;
    public Runtime: string;
    public TLS: {cert: string, key: string, fingerPrint: string};
    public WebUIConfig: { 
        authEnabled: boolean,
        authType: string,
        aad: {
            tenant: string,
            appId: string
        }
    };
}
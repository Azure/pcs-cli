export class Config {
    public AADTenantId: string;
    public AADLoginURL: string;
    public ApplicationId: string;
    public AzureStorageAccountKey: string;
    public AzureStorageAccountName: string;
    public AzureStorageEndpointSuffix: string;
    public AzureMapsKey: string;
    public DocumentDBConnectionString: string;
    public DockerTag: string;
    public DNS: string;
    public EventHubEndpoint: string;
    public EventHubName: string;
    public EventHubPartitions: string;
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
    public MessagesEventHubConnectionString: string;
    public MessagesEventHubName: string;
}
export class Config {
    public AADTenantId: string;
    public AADLoginURL: string;
    public AuthIssuerURL: string;
    public ApplicationId: string;
    public ServicePrincipalSecret: string;
    public AzureStorageAccountKey: string;
    public AzureStorageAccountName: string;
    public AzureStorageEndpointSuffix: string;
    public AzureStorageConnectionString: string;
    public AzureActiveDirectoryEndpointUrl: string;
    public AzureResourceManagerEndpointUrl: string;
    public AzureMapsKey: string;
    public CloudType: string;
    public SubscriptionId: string;
    public SolutionName: string;
    public IotHubName: string;
    public DeploymentId: string;
    public DiagnosticsEndpointUrl: string;
    public DocumentDBConnectionString: string;
    public DockerTag: string;
    public DNS: string;
    public EventHubEndpoint: string;
    public EventHubName: string;
    public EventHubPartitions: string;
    public IoTHubConnectionString: string;
    public LoadBalancerIP: string;
    public Runtime: string;
    public SolutionType: string;
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
    public ActionsEventHubConnectionString: string;
    public ActionsEventHubName: string;
    public TelemetryStorgeType: string;
    public TSIDataAccessFQDN: string;
    public Office365ConnectionUrl: string;
    public LogicAppEndpointUrl: string;
    public SolutionWebsiteUrl: string;
}
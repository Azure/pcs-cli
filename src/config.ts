export class Config {
    public AzureStorageAccountKey: string;
    public AzureStorageAccountName: string;
    public DNS: string;
    public DocumentDBConnectionString: string;

    // They both have same value, just keeping them separate
    // since they are consumed by different environment variables
    // within the containers
    public IoTHubConnectionString: string;
    public IoTHubReactConnectionString: string;

    public IotHubReactEndpoint: string;
    public IotHubReactName: string;
    public IotHubReactPartitions: string;
    public LoadBalancerIP: string;
}
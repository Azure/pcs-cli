export class Config {
    public KeyVaultName: string;
    public ApplicationId: string;
    public ServicePrincipalSecret: string;
    public DockerTag: string;
    public DNS: string;
    public LoadBalancerIP: string;
    public Runtime: string;
    public TLS: {cert: string, key: string, fingerPrint: string};
}
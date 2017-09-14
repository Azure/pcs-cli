const k8s = require('@kubernetes/typescript-node');
const btoa = require('btoa');

import * as fs from 'fs';
import * as path from 'path';
import * as jsyaml from 'js-yaml';

import { Config } from './config';

const MAX_RETRY: number = 36;

export interface IK8sManager {
    setupAll(): Promise<any>;
    setupCofig(): Promise<any>;
    setupCertificate(certData: any): Promise<any>;
    setupDeployment(): Promise<any>;
}

export class K8sManager implements IK8sManager {
    private _configFilePath: string;
    private _api: any;
    private _betaApi: any;
    private _retryCount: number = 0;
    private _namespace: string;
    private _config: Config;

    constructor(namespace: string, kubeConfigFilePath: string, config: Config) {
        this._namespace = namespace;
        this._configFilePath = kubeConfigFilePath;
        this._config = config;
        this._api = k8s.Config.fromFile(this._configFilePath);

        const kc = new k8s.KubeConfig();
        kc.loadFromFile(kubeConfigFilePath);
        this._betaApi = new k8s.Extensions_v1beta1Api(kc.getCurrentCluster().server);
        this._betaApi.authentications.default = kc;
    }

    public setupAll(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    public setupCertificate(certData: any): Promise<any> {
        const secret = new k8s.V1Secret();
        secret.apiVersion = 'v1';
        secret.metadata = new k8s.V1ObjectMeta();
        secret.metadata.name = 'tls-certificate';
        secret.kind = 'Secret';
        secret.type = 'Opaque';
        secret.data = {};
        secret.data['tls.crt'] = btoa(certData.cert);
        secret.data['tls.key'] = btoa(certData.privateKey);
        return new Promise((resolve, reject) => {
            const timer = setInterval(
                ()  => {
                    this._api.createNamespacedSecret(this._namespace, secret)
                    .then((result: any) => {
                        clearInterval(timer);
                        resolve(result);
                    })
                    .catch((error: any) => {
                        if (error.code === 'ETIMEDOUT' && this._retryCount < MAX_RETRY) {
                            this._retryCount++;
                            console.log('Retrying setup certificates: %s of %s', this._retryCount, MAX_RETRY);
                        } else {
                            clearInterval(timer);
                            reject(error);
                        }
                    });
                },
                5000
            );
        });
    }

    public setupCofig(): Promise<any> {
        const configPath = process.cwd() + path.sep + 'remotemonitoring/scripts/individual/deployment-configmap.yaml';
        const configMap = jsyaml.safeLoad(fs.readFileSync(configPath, 'UTF-8'));
        configMap.data['iothub.connstring'] = this._config.IoTHubConnectionString;
        configMap.data['docdb.connstring']  = this._config.DocumentDBConnectionString;
        configMap.data['iothubreact.hub.name'] = this._config.IotHubReactName;
        configMap.data['iothubreact.hub.endpoint'] = this._config.IotHubReactEndpoint;
        configMap.data['iothubreact.hub.partitions'] = this._config.IotHubReactPartitions;
        configMap.data['iothubreact.access.connstring'] = this._config.IoTHubReactConnectionString;
        configMap.data['iothubreact.azureblob.account'] = this._config.AzureStorageAccountName;
        configMap.data['iothubreact.azureblob.key'] = this._config.AzureStorageAccountKey;
        return this._api.createNamespacedConfig(this._namespace, configMap);
    }

    public setupDeployment(): Promise<any> {
        const promises = new Array<Promise<any>>();
        const allInOnePath = process.cwd() + path.sep + 'remotemonitoring/scripts/all-in-one.yaml';
        const data = fs.readFileSync(allInOnePath, 'UTF-8');
        const allInOne = jsyaml.safeLoadAll(data, (doc: any) => {
            switch (doc.kind) {
                case 'Service':
                    if (doc.spec.type === 'LoadBalancer') {
                        doc.spec.LoadBalancerIP = this._config.LoadBalancerIP;
                    }
                    promises.push(this._api.createNamespacedService(this._namespace, doc));
                    break;
                case 'ReplicationController':
                    promises.push(this._api.createNamespacedReplicationController(this._namespace, doc));
                    break;
                case 'Deployment':
                    promises.push(this._betaApi.createNamespacedDeployment(this._namespace, doc));
                    break;
                case 'Ingress':
                    console.log(JSON.stringify(doc), null, 2);
                    doc.spec.rules[0].host = this._config.DNS;
                    doc.spec.tls[0].hosts[0] = this._config.DNS;
                    promises.push(this._betaApi.createNamespacedIngress(this._namespace, doc));
                    break;
                default:
                    console.log();
            }
        });
        return Promise.all(promises);
    }
}
const k8s = require('@kubernetes/typescript-node');
const btoa = require('btoa');

import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as jsyaml from 'js-yaml';

import { Config } from './config';
import DeployUI from './deployui';

const MAX_RETRY: number = 36;
const DEFAULT_TIMEOUT = 10000;

export interface IK8sManager {
    createNamespace(name: string): Promise<any>;
    deleteAll(): Promise<any>;
    deleteConfigMap(): Promise<any>;
    deleteSecrets(): Promise<any>;
    deleteDeployment(): Promise<any>;
    setupAll(): Promise<any>;
    setupConfigMap(): Promise<any>;
    setupSecrets(): Promise<any>;
    setupDeployment(): Promise<any>;
}

export class K8sManager implements IK8sManager {
    private _configFilePath: string;
    private _api: any;
    private _betaApi: any;
    private _retryCount: number = 0;
    private _namespace: string;
    private _config: Config;
    private _secret: any;
    private _deployUI: DeployUI;

    constructor(namespace: string, kubeConfigFilePath: string, config: Config) {
        this._namespace = namespace;
        this._configFilePath = kubeConfigFilePath;
        this._config = config;
        this._api = k8s.Config.fromFile(this._configFilePath);

        const kc = new k8s.KubeConfig();
        kc.loadFromFile(kubeConfigFilePath);
        this._betaApi = new k8s.Extensions_v1beta1Api(kc.getCurrentCluster().server);
        this._betaApi.authentications.default = kc;

        this._secret = new k8s.V1Secret();
        this._secret.apiVersion = 'v1';
        this._secret.metadata = new k8s.V1ObjectMeta();
        this._secret.metadata.name = 'tls-certificate';
        this._secret.metadata.namespace = this._namespace;
        this._secret.kind = 'Secret';
        this._secret.type = 'Opaque';
        this._secret.data = {};
        this._deployUI = DeployUI.instance;
    }

    public createNamespace(name: string): Promise<any> {
        const ns = new k8s.V1Namespace();
        ns.apiVersion = 'v1';
        ns.kind = 'Namespace';
        ns.metadata = {};
        ns.metadata.name = this._namespace;
        return new Promise((resolve, reject) => {
            const timer = setInterval(
                ()  => {
                    return this._api.createNamespace(ns)
                    .then((result: any) => {
                        clearInterval(timer);
                        resolve(result);
                    })
                    .catch((error: any) => {
                        if (error.code === 'ETIMEDOUT' && this._retryCount < MAX_RETRY) {
                            this._retryCount++;
                            console.log(`${chalk.yellow('Create namespace: retrying', this._retryCount.toString(), 'of', MAX_RETRY.toString())}`);
                        } else {
                            let err = error;
                            if (error.code !== 'ETIMEDOUT') {
                                // Convert a response to properl format in case of json
                                err = JSON.stringify(error, null, 2);
                            }
                            clearInterval(timer);
                            reject(err);
                        }
                    });
                },
                DEFAULT_TIMEOUT
            );
        });
    }

    public deleteAll(): Promise<any> {
        return this.deleteSecrets()
        .then(() => {
            return this.deleteConfigMap();
        })
        .then(() => {
            return this.deleteDeployment();
        });
    }

    public deleteSecrets(): Promise<any> {
        return this._api.deleteNamespacedSecret(this._secret.metadata.name, this._namespace, this._secret);
    }

    public deleteConfigMap(): Promise<any> {
        const configPath = __dirname + path.sep + 'remotemonitoring/scripts/individual/deployment-configmap.yaml';
        const configMap = jsyaml.safeLoad(fs.readFileSync(configPath, 'UTF-8'));
        configMap.metadata.namespace = this._namespace;
        return this._api.deleteNamespacedConfigMap(configMap.metadata.name, this._namespace, configMap);
    }

    public deleteDeployment(): Promise<any> {
        const promises = new Array<Promise<any>>();
        const allInOnePath = process.cwd() + path.sep + 'remotemonitoring/scripts/all-in-one.yaml';
        const data = fs.readFileSync(allInOnePath, 'UTF-8');
        const allInOne = jsyaml.safeLoadAll(data, (doc: any) => {
            doc.metadata.namespace = this._namespace;
            switch (doc.kind) {
                case 'Service':
                    promises.push(this._api.deleteNamespacedService(doc.metadata.name, this._namespace, doc));
                    break;
                case 'ReplicationController':
                    promises.push(this._api.deleteNamespacedReplicationController(doc.metadata.name, this._namespace, doc));
                    break;
                case 'Deployment':
                    promises.push(this._betaApi.deleteNamespacedDeployment(doc.metadata.name, this._namespace, doc));
                    break;
                case 'Ingress':
                    doc.spec.rules[0].host = this._config.DNS;
                    doc.spec.tls[0].hosts[0] = this._config.DNS;
                    promises.push(this._betaApi.deleteNamespacedIngress(doc.metadata.name, this._namespace, doc));
                    break;
                default:
                console.log('Unexpected kind found in yaml file');
            }
        });
        return Promise.all(promises);
    }

    public setupAll(): Promise<any> {
        this._deployUI.start('Setting up Kubernetes: Uploading secrets');
        return this.setupSecrets()
            .then(() => {
                this._deployUI.start('Setting up Kubernetes: Uploading config map');
                return this.setupConfigMap();
            })
            .then(() => {
                this._deployUI.start('Setting up Kubernetes: Starting web app and microservices');
                return this.setupDeployment();
            });
    }

    public setupSecrets(): Promise<any> {
        this._secret.data['tls.crt'] = btoa(this._config.TLS.cert);
        this._secret.data['tls.key'] = btoa(this._config.TLS.key);
        return new Promise((resolve, reject) => {
            const timer = setInterval(
                ()  => {
                    return this._api.createNamespacedSecret(this._namespace, this._secret)
                    .then((result: any) => {
                        clearInterval(timer);
                        resolve(result);
                    })
                    .catch((error: any) => {
                        if (error.code === 'ETIMEDOUT' && this._retryCount < MAX_RETRY) {
                            this._retryCount++;
                        } else {
                            let err = error;
                            if (error.code !== 'ETIMEDOUT') {
                                // Convert a response to properl format in case of json
                                err = JSON.stringify(error, null, 2);
                            }
                            clearInterval(timer);
                            reject(err);
                        }
                    });
                },
                DEFAULT_TIMEOUT
            );
        });
    }

    public setupConfigMap(): Promise<any> {
        const configPath = process.cwd() + path.sep + 'remotemonitoring/scripts/individual/deployment-configmap.yaml';
        const configMap = jsyaml.safeLoad(fs.readFileSync(configPath, 'UTF-8'));
        configMap.metadata.namespace = this._namespace;
        configMap.data['security.auth.audience'] = this._config.ApplicationId;
        configMap.data['security.auth.issuer'] = 'https://sts.windows.net/' + this._config.AADTenantId + '/';
        configMap.data['security.application.secret'] = this.genPassword();
        configMap.data['bing.map.key'] = this._config.BingMapApiQueryKey ? this._config.BingMapApiQueryKey : '';
        configMap.data['iothub.connstring'] = this._config.IoTHubConnectionString;
        configMap.data['docdb.connstring']  = this._config.DocumentDBConnectionString;
        configMap.data['iothubreact.hub.name'] = this._config.EventHubName;
        configMap.data['iothubreact.hub.endpoint'] = this._config.EventHubEndpoint;
        configMap.data['iothubreact.hub.partitions'] = this._config.EventHubPartitions;
        configMap.data['iothubreact.access.connstring'] = this._config.IoTHubConnectionString;
        configMap.data['iothubreact.azureblob.account'] = this._config.AzureStorageAccountName;
        configMap.data['iothubreact.azureblob.key'] = this._config.AzureStorageAccountKey;
        configMap.data['iothubreact.azureblob.endpointsuffix'] = this._config.AzureStorageEndpointSuffix;
        let deploymentConfig = configMap.data['webui-config.js'];
        deploymentConfig = deploymentConfig.replace('{TenantId}', this._config.AADTenantId);
        deploymentConfig = deploymentConfig.replace('{ApplicationId}', this._config.ApplicationId);
        deploymentConfig = deploymentConfig.replace('{AADLoginInstance}', this._config.AADLoginURL);
        configMap.data['webui-config.js'] = deploymentConfig;
        return this._api.createNamespacedConfigMap(this._namespace, configMap);
    }

    public setupDeployment(): Promise<any> {
        const promises = new Array<Promise<any>>();
        const allInOnePath = process.cwd() + path.sep + 'remotemonitoring/scripts/all-in-one.yaml';
        const data = fs.readFileSync(allInOnePath, 'UTF-8');
        const allInOne = jsyaml.safeLoadAll(data, (doc: any) => {
            doc.metadata.namespace = this._namespace;
            switch (doc.kind) {
                case 'Service':
                    if (doc.spec.type === 'LoadBalancer') {
                        doc.spec.loadBalancerIP = this._config.LoadBalancerIP;
                    }
                    promises.push(this._api.createNamespacedService(this._namespace, doc));
                    break;
                case 'ReplicationController':
                    promises.push(this._api.createNamespacedReplicationController(this._namespace, doc));
                    break;
                case 'Deployment':
                    const imageName: string = doc.spec.template.spec.containers[0].image;
                    if (imageName.includes('{runtime}')) {
                        doc.spec.template.spec.containers[0].image = imageName.replace('{runtime}', this._config.Runtime);
                    }
                    promises.push(this._betaApi.createNamespacedDeployment(this._namespace, doc));
                    break;
                case 'Ingress':
                    doc.spec.rules[0].host = this._config.DNS;
                    doc.spec.tls[0].hosts[0] = this._config.DNS;
                    promises.push(this._betaApi.createNamespacedIngress(this._namespace, doc));
                    break;
                default:
                    console.log('Unexpected kind found in yaml file');
            }
        });
        return Promise.all(promises);
    }

    private genPassword(): string {
        const chs = '0123456789-ABCDEVISFGHJKLMNOPQRTUWXYZ_abcdevisfghjklmnopqrtuwxyz'.split('');
        const len = chs.length;
        let result = '';
        for (let i = 0; i < 40; i++) {
            result += chs[Math.floor(len * Math.random())];
        }
        return result;
    }
}

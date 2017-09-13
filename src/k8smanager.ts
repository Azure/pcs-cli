const k8s = require('@kubernetes/typescript-node');
const btoa = require('btoa');

import * as fs from 'fs';
import * as jsyaml from 'js-yaml';

const MAX_RETRY: number = 36;

export interface IK8sManager {
    setupCertificate(certData: any): Promise<any>;
}

export class K8sManager implements IK8sManager {
    private _configFilePath: string;
    private _api: any;
    private _retryCount: number = 0;

    constructor(kubeConfigFilePath: string) {
        this._configFilePath = kubeConfigFilePath;
        this._api = k8s.Config.fromFile(this._configFilePath);
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
                    this._api.createNamespacedSecret('default', secret)
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
}
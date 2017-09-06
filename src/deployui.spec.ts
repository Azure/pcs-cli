import DeployUI from './deployui';

describe('sample test for setting up jest', () => {
  test('null check for deployUI',  () => {
    const deployUI: any = DeployUI.instance;
    expect(deployUI).toBeInstanceOf(DeployUI);
    deployUI.close();
  });
});

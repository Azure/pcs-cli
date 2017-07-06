import DeployUI from './deployui';

describe('sample test for setting up jest', () => {
  test('null check for deployUI',  () => {
    const deployUI: any = new DeployUI();
    expect(deployUI).toBeInstanceOf(DeployUI);
    deployUI.close();
  });
});

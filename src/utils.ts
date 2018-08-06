function genPassword(): string {
    const chs = '0123456789-ABCDEVISFGHJKLMNOPQRTUWXYZ_abcdevisfghjklmnopqrtuwxyz'.split('');
    const len = chs.length;
    let result = '';
    for (let i = 0; i < 40; i++) {
        result += chs[Math.floor(len * Math.random())];
    }
    return result;
}

export { genPassword };
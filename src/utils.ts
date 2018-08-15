function genPassword(): string {
    const chars = '0123456789-ABCDEVISFGHJKLMNOPQRTUWXYZ_abcdevisfghjklmnopqrtuwxyz'.split('');
    const length = chars.length;
    let result = '';
    for (let i = 0; i < 40; i++) {
        result += chars[Math.floor(length * Math.random())];
    }
    return result;
}

export { genPassword };
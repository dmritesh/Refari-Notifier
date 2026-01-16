import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.MASTER_ENCRYPTION_KEY;

if (!SECRET_KEY) {
    // Can't throw top-level in commonjs/node sometimes depending on load order, 
    // but for a service module it's fine.
    // We'll throw when a function is called if we want to be safer, 
    // but fail-fast is better here.
}

export const encrypt = (text: string): string => {
    if (!SECRET_KEY) throw new Error('MASTER_ENCRYPTION_KEY is not defined');
    return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
};

export const decrypt = (ciphertext: string): string => {
    if (!SECRET_KEY) throw new Error('MASTER_ENCRYPTION_KEY is not defined');
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
};

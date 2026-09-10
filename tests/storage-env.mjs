export const env=new Proxy({}, {get:(_,key)=>globalThis.testStorageEnv?.[key]});

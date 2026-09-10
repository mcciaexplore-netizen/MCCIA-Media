import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const files=['records','clippings','google-news-alerts','epaper-sources'];
const digest=createHash('sha256');for(const file of files)digest.update(readFileSync(new URL(`../app/${file}.json`,import.meta.url)));
const dataHash=digest.digest('hex'),path=new URL('../app/archive-metadata.json',import.meta.url);
const prior=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
if(prior?.dataHash!==dataHash)writeFileSync(path,JSON.stringify({updatedAt:new Date().toISOString(),dataHash,datasets:files},null,2)+'\n');

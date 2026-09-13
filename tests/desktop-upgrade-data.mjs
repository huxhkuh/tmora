// Compare old/new production code against a copy of the benchmark's synthetic
// history. Never open or copy the personal installed-app data directory.
import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const source=JSON.parse(await fs.readFile(process.argv[2] || 'work/performance/before-physical.json','utf8'));
if (!path.resolve(source.profile).startsWith(path.resolve('../../work/performance-'))) throw Error('Expected an isolated benchmark profile');
const profile=await fs.mkdtemp(path.resolve('../../work/upgrade-history-'));
await fs.cp(source.profile,profile,{recursive:true});
const current=(await fs.readFile('../../work/security-test-exe.txt','utf8')).trim();
const expectedVersion=JSON.parse(await fs.readFile('package.json','utf8')).version;
async function inspect(executablePath) {
 const app=await electron.launch({executablePath,args:[],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,BOU_DESKTOP_TEST:'1',BOU_TEST_PROFILE:profile}});
 try {
  const page=await app.firstWindow();await expect(page.getByRole('button',{name:'גיבוי והגדרות',exact:true})).toBeVisible();
  const state=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('bou-personal-time-v1');
   request.onsuccess=()=>{const db=request.result;const get=db.transaction('state').objectStore('state').get('main');get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=reject;};request.onerror=reject;
  }));
  return {version:await app.evaluate(({app})=>app.getVersion()),state};
 }finally{await app.close();}
}
const before=await inspect(source.exe),after=await inspect(current);
expect(before.version).not.toBe(expectedVersion);expect(after.version).toBe(expectedVersion);
expect(before.state.entries).toHaveLength(1000);expect(before.state.timer.runningSince).toBeGreaterThan(0);
expect(after.state).toEqual(before.state);
console.log(JSON.stringify({passed:true,from:before.version,to:after.version,entries:1000,checks:['all entry segments, descriptions and historical prices unchanged','projects and clients unchanged','active timer timestamps unchanged'],profile}));

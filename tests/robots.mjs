import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

test('every workspace screen, sign-in and the API stay out of search; the landing page and legal pages do not',()=>{
 const {default:robots,privatePaths}=loadTS('app/robots.ts');
 const {sections}=loadTS('components/workspace/navigation.ts',{'lucide-react':new Proxy({},{get:()=>()=>null})});
 for(const {path} of sections)if(path!=='/')assert.ok(privatePaths.includes(path),path+' is kept out of search');
 const [rule]=robots().rules;
 assert.deepEqual(rule.allow,['/','/privacy','/terms']);
 assert.ok(['/api/','/sign-in','/auth/'].every(path=>rule.disallow.includes(path)));
 assert.ok(!rule.disallow.some(path=>['/','/privacy','/terms'].includes(path)));
});

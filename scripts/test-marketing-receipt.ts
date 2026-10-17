import assert from 'node:assert/strict'
import { marketingReceipt } from './lib/marketing-receipt'
const receipt = marketingReceipt('job-1', 'campaign-1', ['youtube','instagram','facebook','twitter'], {youtube:true,instagram:true,facebook:false}, new Set(['twitter']), {youtubeId:'yt-123'})
assert.equal(receipt.schemaVersion,1)
assert.deepEqual(receipt.channels.youtube,{status:'published',postId:'yt-123'})
assert.deepEqual(receipt.channels.instagram,{status:'unconfirmed'})
assert.deepEqual(receipt.channels.facebook,{status:'unconfirmed'})
assert.deepEqual(receipt.channels.twitter,{status:'skipped'})
assert.equal(JSON.stringify(receipt).includes('token'),false)
console.log('Marketing receipt contract checks passed')
import { claimMarketingJob } from './lib/marketing-job'
async function testClaims() {
 const entries=new Set<string>()
 const create=async(key:string,_value:string)=>{if(entries.has(key))throw new Error('precondition');entries.add(key)}
 const id='b6f79316-3557-4f6a-9aa6-517eacdb83ab'
 await claimMarketingJob(id,'campaign-1',1,create)
 await assert.rejects(()=>claimMarketingJob(id,'campaign-1',1,create),/precondition/)
 await assert.rejects(()=>claimMarketingJob(id,'campaign-1',2,create),/cannot be rerun/)
 await assert.rejects(()=>claimMarketingJob('../bad','campaign-1',1,create),/Invalid/)
 assert.equal(entries.size,1)
 console.log('Marketing job claim checks passed')
}
testClaims().catch(error=>{console.error(error);process.exitCode=1})

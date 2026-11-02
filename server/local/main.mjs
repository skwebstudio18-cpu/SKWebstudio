import { openLocalDatabase } from './database.mjs';
import { createLocalServer } from './server.mjs';
import {metaConfig} from '../reminders/meta.mjs';
import {runReminders} from '../reminders/delivery.mjs';
const port=Number(process.env.SKTS_LOCAL_PORT??8080);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid SKTS_LOCAL_PORT.');
const local=await openLocalDatabase();
const server=createLocalServer({pool:local.pool});
server.on('error',async(error)=>{console.error(`Local server could not start: ${error.code}. Database files are preserved.`);await local.close();process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`SKTS local backend: http://localhost:${port}/portal/`);console.log('Persistent database: '+local.directory);console.log('First visit: create your local owner password. No password or record is sent to Netlify.');});
let stopping=false;
let remindersBusy=false;
async function reminderTick(){if(stopping||remindersBusy)return;remindersBusy=true;try{await runReminders({pool:local.pool,config:metaConfig()});}catch{console.error('Reminder check failed. No credentials or client details logged.');}finally{remindersBusy=false;}}
const reminderTimer=setInterval(reminderTick,5*60000);reminderTimer.unref();
async function stop(){if(stopping)return;stopping=true;clearInterval(reminderTimer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));while(remindersBusy)await new Promise(resolve=>setTimeout(resolve,100));await local.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{if(chunk.trim()==='stop'||chunk.includes('\u0003'))void stop();});

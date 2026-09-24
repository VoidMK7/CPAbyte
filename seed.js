import Database from "better-sqlite3";
import path from "path";
import {fileURLToPath} from "url";
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"..");
const db=new Database(path.join(root,"data","hillsbyte.db"));
const exists=db.prepare("SELECT id FROM tasks LIMIT 1").get();
if(!exists){
 db.prepare("INSERT INTO tasks(title,short_description,description,url,reward,max_slots,daily_slots,timer_seconds,logo_url,image_url,ad_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
 .run("Website Experience Review","Review a website and upload proof.","Open the task link, follow the instructions, complete the required experience, then upload up to 4 screenshots as proof.","https://example.com",0.75,1000,200,120,"","",1);
}
console.log("Seed complete.");
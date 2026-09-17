import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { change, read } from "../src/store.js";
import { timerAction, fresh } from "../src/domain.js";
import { taskAction } from "../src/tasks.js";
test("IndexedDB serializes simultaneous tab-like mutations; one start and one save", async () => {
  await change((s) =>
    Object.assign(s, {
      ...fresh(),
      clients: [{ id: "c", name: "לקוח" }],
      projects: [
        {
          id: "p",
          name: "פרויקט",
          clientId: "c",
          archived: false,
          priceType: "hourly",
          price: 100,
        },
      ],
    }),
  );
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      change((s) =>
        timerAction(
          s,
          { type: "start", projectId: "p", expected: null, id: "t" + i },
          1000,
        ),
      ),
    ),
  );
  let s = await read();
  assert.equal(s.entries.length, 0);
  const id = s.timer.id;
  await Promise.all(
    Array.from({ length: 30 }, () =>
      change((s) => timerAction(s, { type: "stop", expected: id }, 4000)),
    ),
  );
  s = await read();
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].segments[0].end, 4000);
  assert.equal(s.timer, null);
});
test("failed transaction rolls back all writes", async () => {
  const before = await read();
  await assert.rejects(
    change((s) => {
      s.clients.push({ id: "bad" });
      throw Error("fail");
    }),
  );
  assert.deepEqual(await read(), before);
});

test("concurrent checklist updates preserve each task and unrelated project edits", async () => {
  await change((s) => { s.projects.push({ id: "checklist-project", name: "פרויקט" }); });
  await Promise.all(Array.from({ length: 12 }, (_, i) => change((s) => taskAction(s, { type: "add", id: `task-${i}`, projectId: "checklist-project", title: `משימה ${i}` }))));
  await Promise.all([
    change((s) => taskAction(s, { type: "complete", id: "task-0", projectId: "checklist-project", completed: true })),
    change((s) => taskAction(s, { type: "rename", id: "task-0", projectId: "checklist-project", title: "הושלם ונערך", expectedTitle: "משימה 0" })),
    change((s) => { s.projects.find((p) => p.id === "checklist-project").name = "שם חדש"; }),
  ]);
  const s = await read();
  assert.equal(s.tasks.filter((t) => t.projectId === "checklist-project").length, 12);
  assert.equal(s.tasks.find((t) => t.id === "task-0").completed, true);
  assert.equal(s.tasks.find((t) => t.id === "task-0").title, "הושלם ונערך");
  assert.equal(s.projects.find((p) => p.id === "checklist-project").name, "שם חדש");
});

test("delete/start and delete/task races remain atomic without orphan records", async () => {
  const { deletionPreview, deleteEntity } = await import('../src/deletion.js');
  for (const first of ['delete','timer','task']) {
    await change(s => Object.assign(s, { ...fresh(), clients:[{id:'c',name:'Client'}], projects:[{id:'p',name:'Project',clientId:'c',archived:false,priceType:'none',price:null}] }));
    const confirmation=deletionPreview(await read(),'project','p');
    const remove=()=>change(s=>deleteEntity(s,confirmation,'Project'));
    const start=()=>change(s=>timerAction(s,{type:'start',projectId:'p',expected:null,id:'t'},1000000));
    const add=()=>change(s=>taskAction(s,{type:'add',projectId:'p',id:'task',title:'Work'}));
    const results=await Promise.allSettled(first==='delete'?[remove(),start(),add()]:first==='timer'?[start(),remove()]:[add(),remove()]);
    const after=await read();
    if(first==='delete') { assert.equal(after.projects.length,0);assert.equal(after.timer,null);assert.equal(after.tasks.length,0); }
    else { assert.equal(results[1].status,'rejected');assert.equal(after.projects.length,1); }
    if(after.timer) assert.ok(after.projects.some(p=>p.id===after.timer.projectId));
    for(const task of after.tasks) assert.ok(after.projects.some(p=>p.id===task.projectId));
  }
});

test('v1 migration and its exact recovery snapshot commit atomically and only once', async () => {
  const {openDB,readBeforeUpgrade}=await import('../src/store.js');
  const {billingDemo}=await import('./fixtures/billing.js');
  const legacy=billingDemo();legacy.version=1;
  for(const e of legacy.entries){delete e.billingStatus;delete e.internalNotes;}
  const db=await openDB();
  const writeRaw=(data)=>new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'main');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
  await writeRaw(legacy);
  await assert.rejects(change(s=>{s.entries=[];throw Error('simulated write failure');}));
  assert.equal(await readBeforeUpgrade(),null);
  const [a,b]=await Promise.all([read(),read()]);assert.equal(a.version,2);assert.deepEqual(a,b);
  assert.deepEqual(await readBeforeUpgrade(),legacy);
  assert.equal(a.entries[0].billingStatus,'unclassified');
  await change(s=>{s.entries[0].billingStatus='billable';s.entries[0].description='edited';});
  await read();assert.deepEqual(await readBeforeUpgrade(),legacy);
  assert.equal((await read()).entries[0].billingStatus,'billable');
  await writeRaw({...legacy,version:99});
  await assert.rejects(read());assert.deepEqual(await readBeforeUpgrade(),legacy);
  await writeRaw(a);
});

// Slot booking server. No dependencies. Node 16+.  Run: ADMIN_PASSWORD=yourpass node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000, PRICE=+process.env.PRICE||150, PASS=process.env.ADMIN_PASSWORD;
const DIR=process.env.DATA_DIR||__dirname, FILE=path.join(DIR,'data.json'), HOLD_MS=10*60*1000, TOTAL=50, SESS=['s1','s2','s3'];
if(!PASS){console.error('Set the ADMIN_PASSWORD environment variable.');process.exit(1)}
let db={payments:{}};try{db=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}
const tokens=new Set(), fails={};
const save=()=>{fs.writeFileSync(FILE+'.tmp',JSON.stringify(db));fs.renameSync(FILE+'.tmp',FILE)};
const sweep=()=>{const n=Date.now();let c=0;for(const p of Object.values(db.payments))if(p.status==='awaiting'&&p.expires<n){p.status='expired';c=1}if(c)save()};
const live=p=>['awaiting','verifying','confirmed'].includes(p.status);
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
const body=req=>new Promise((ok,no)=>{let b='';req.on('data',d=>{b+=d;if(b.length>10000){no();req.destroy()}});req.on('end',()=>{try{ok(JSON.parse(b||'{}'))}catch(e){ok({})}})});
const pub=p=>({id:p.id,date:p.date,sess:p.sess,slots:p.slots,total:p.total,status:p.status,txn:p.txn||'',left:Math.max(0,Math.round((p.expires-Date.now())/1000))});
const same=(a,b)=>{a=Buffer.from(a);b=Buffer.from(b);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const isAdmin=req=>tokens.has((req.headers.authorization||'').replace('Bearer ',''));
const FILES={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/qr.jpg':['qr.jpg','image/jpeg']};

http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),p=u.pathname,ip=req.socket.remoteAddress;
  try{
    if(!p.startsWith('/api/')){const f=FILES[p];if(!f){res.writeHead(404);return res.end('Not found')}
      res.writeHead(200,{'Content-Type':f[1],'X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(__dirname,'public',f[0])))}
    sweep();
    if(p==='/api/state'){const d=u.searchParams.get('date')||'',booked={},held={};
      for(const x of Object.values(db.payments))if(x.date===d&&live(x))for(const n of x.slots)(x.status==='confirmed'?booked:held)[x.sess+':'+n]=1;
      return send(res,200,{booked,held,price:PRICE})}
    if(p==='/api/hold'&&req.method==='POST'){const b=await body(req);
      const slots=[...new Set((b.slots||[]).map(Number))].sort((a,c)=>a-c),name=String(b.name||'').trim(),phone=String(b.phone||'').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!SESS.includes(b.sess)||!slots.length||slots.length>10||slots.some(n=>!Number.isInteger(n)||n<1||n>TOTAL)||name.length<2||name.length>80||phone.replace(/\D/g,'').length<10||phone.length>25)return send(res,400,{error:'invalid'});
      if(Object.values(db.payments).filter(x=>x.ip===ip&&x.status==='awaiting').length>=3)return send(res,429,{error:'too_many'});
      const bad=[];for(const x of Object.values(db.payments))if(x.date===b.date&&x.sess===b.sess&&live(x))for(const n of x.slots)if(slots.includes(n))bad.push(n);
      if(bad.length)return send(res,409,{error:'taken',slots:bad});
      const id=crypto.randomBytes(12).toString('hex');
      db.payments[id]={id,ip,date:b.date,sess:b.sess,slots,name,phone,total:slots.length*PRICE,status:'awaiting',expires:Date.now()+HOLD_MS,txn:'',created:Date.now()};save();
      return send(res,200,pub(db.payments[id]))}
    let m=p.match(/^\/api\/pay\/([0-9a-f]{24})(\/(submit|cancel))?$/);
    if(m){const x=db.payments[m[1]];if(!x)return send(res,404,{error:'not_found'});
      if(!m[2])return send(res,200,pub(x));
      if(req.method!=='POST')return send(res,405,{});
      if(m[3]==='cancel'){if(x.status==='awaiting'||x.status==='verifying'){x.status='cancelled';save()}return send(res,200,pub(x))}
      const b=await body(req),t=String(b.txn||'').trim();
      if(x.status!=='awaiting')return send(res,409,{error:'expired',status:x.status});
      if(!/^[A-Za-z0-9-]{6,40}$/.test(t))return send(res,400,{error:'invalid_txn'});
      x.status='verifying';x.txn=t;save();return send(res,200,pub(x))}
    if(p==='/api/admin/login'&&req.method==='POST'){const b=await body(req),f=fails[ip]||(fails[ip]={n:0,t:Date.now()});
      if(Date.now()-f.t>6e5){f.n=0;f.t=Date.now()}if(f.n>=5)return send(res,429,{error:'locked'});
      if(!same(String(b.password||''),PASS)){f.n++;return send(res,401,{error:'wrong'})}
      const t=crypto.randomBytes(24).toString('hex');tokens.add(t);return send(res,200,{token:t})}
    if(p.startsWith('/api/admin/')){if(!isAdmin(req))return send(res,401,{error:'auth'});
      if(p==='/api/admin/payments'){const l=Object.values(db.payments).filter(x=>['awaiting','verifying','confirmed'].includes(x.status)).map(x=>({...pub(x),name:x.name,phone:x.phone}));return send(res,200,l)}
      if(p==='/api/admin/export.csv'){const L={s1:'4:00 pm - 5:00 pm',s2:'5:30 pm - 6:30 pm',s3:'7:00 pm - 8:00 pm'};
        const q=v=>{v=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
        const rows=[['Date','Session','Slot','Name','Mobile','InstaPay Reference','Amount (PHP)','Booking ID','Confirmed At']];
        Object.values(db.payments).filter(x=>x.status==='confirmed').sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.sess<b.sess?-1:a.created-b.created).forEach(x=>x.slots.forEach(n=>rows.push([x.date,L[x.sess],n,x.name,x.phone,x.txn,x.total/x.slots.length,x.id,x.confirmedAt?new Date(x.confirmedAt).toISOString():''])));
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="confirmed-bookings.csv"','Cache-Control':'no-store'});
        return res.end('\ufeff'+rows.map(r=>r.map(q).join(',')).join('\r\n'))}
      m=p.match(/^\/api\/admin\/([0-9a-f]{24})\/(release|extend|markpaid)$/);
      if(m&&req.method==='POST'){const x=db.payments[m[1]],b=await body(req);if(!x||!['awaiting','verifying'].includes(x.status))return send(res,409,{error:'not_open'});
        if(m[2]==='release')x.status='cancelled';
        else if(m[2]==='extend'){if(x.status!=='awaiting')return send(res,409,{error:'not_open'});x.expires=Date.now()+HOLD_MS}
        else{const t=String(b.txn||'').trim().slice(0,40);x.status='confirmed';x.txn=t||x.txn||'MANUAL';x.confirmedAt=Date.now()}
        save();return send(res,200,pub(x))}
      m=p.match(/^\/api\/admin\/([0-9a-f]{24})\/(confirm|reject)$/);
      if(m&&req.method==='POST'){const x=db.payments[m[1]];if(!x||x.status!=='verifying')return send(res,409,{error:'not_pending'});x.status=m[2]==='confirm'?'confirmed':'rejected';if(m[2]==='confirm')x.confirmedAt=Date.now();save();return send(res,200,pub(x))}}
    send(res,404,{error:'not_found'})
  }catch(e){send(res,500,{error:'server'})}
}).listen(PORT,()=>console.log('Booking app on port '+PORT));

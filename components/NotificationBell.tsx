'use client';
import React, { useState, useEffect, useRef } from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#22c55e',RED='#ef4444',YELLOW='#f59e0b';

interface Notification { id:string; type:string; title:string; body:string; link:string; read:boolean; created_at:string; }

const DEMO_NOTIFICATIONS:Notification[] = [
  {id:'n1',type:'pay_app',title:'Pay App #2 Approved',body:'Owner approved $156,750 — ready to invoice',link:'/app/projects/demo/pay-apps',read:false,created_at:'2026-03-10T08:30:00Z'},
  {id:'n2',type:'insurance',title:'Insurance Expiring Soon',body:'Southwest Plumbing COI expires in 14 days',link:'/app/projects/demo/compliance',read:false,created_at:'2026-03-10T07:15:00Z'},
  {id:'n3',type:'lien_waiver',title:'Lien Waiver Signed',body:'SunState Concrete signed unconditional partial waiver',link:'/app/projects/demo/lien-waivers',read:false,created_at:'2026-03-09T16:45:00Z'},
  {id:'n4',type:'rfi',title:'New RFI Submitted',body:'RFI #14 — Footing depth clarification on Grid B',link:'/app/projects/demo/rfis',read:true,created_at:'2026-03-09T11:20:00Z'},
  {id:'n5',type:'sub',title:'Sub Accepted Invitation',body:'Desert HVAC Solutions accepted bid invite for Mechanical',link:'/app/projects/demo/bid-packages',read:true,created_at:'2026-03-08T14:00:00Z'},
];

const TYPE_ICONS:Record<string,string> = {pay_app:'💰',insurance:'📋',lien_waiver:'📄',rfi:'❓',sub:'🤝',default:'🔔'};

export default function NotificationBell(){
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(DEMO_NOTIFICATIONS);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n=>!n.read).length;

  useEffect(()=>{
    function handle(e:MouseEvent){ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown',handle);
    return ()=>document.removeEventListener('mousedown',handle);
  },[]);

  function markAllRead(){ setNotifications(prev=>prev.map(n=>({...n,read:true}))); }
  function markRead(id:string){ setNotifications(prev=>prev.map(n=>n.id===id?{...n,read:true}:n)); }

  function timeAgo(dateStr:string){
    const diff = Date.now()-new Date(dateStr).getTime();
    const hours = Math.floor(diff/3600000);
    if(hours<1) return 'Just now';
    if(hours<24) return `${hours}h ago`;
    return `${Math.floor(hours/24)}d ago`;
  }

  return (
    <div ref={ref} style={{position:'relative' as const}}>
      <button onClick={()=>setOpen(!open)} style={{position:'relative' as const,background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontSize:18}}>🔔</span>
        {unreadCount>0&&(
          <span style={{position:'absolute' as const,top:-4,right:-4,minWidth:18,height:18,background:RED,borderRadius:9,fontSize:10,fontWeight:800,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px',border:`2px solid ${DARK}`}}>
            {unreadCount>9?'9+':unreadCount}
          </span>
        )}
      </button>

      {open&&(
        <div style={{position:'absolute' as const,right:0,top:'calc(100% + 8px)',width:'min(360px, calc(100vw - 24px))',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,boxShadow:'0 20px 60px rgba(0,0,0,.5)',zIndex:1000,overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,.2)'}}>
            <span style={{fontWeight:700,fontSize:14,color:TEXT}}>Notifications</span>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {unreadCount>0&&<span style={{fontSize:11,background:`rgba(239,68,68,.15)`,color:RED,padding:'2px 7px',borderRadius:4,fontWeight:700}}>{unreadCount} new</span>}
              <button onClick={markAllRead} style={{background:'none',border:'none',color:DIM,fontSize:11,cursor:'pointer'}}>Mark all read</button>
            </div>
          </div>
          <div style={{maxHeight:380,overflowY:'auto'}}>
            {notifications.length===0&&(
              <div style={{padding:32,textAlign:'center' as const,color:DIM,fontSize:13}}>No notifications</div>
            )}
            {notifications.map(n=>(
              <div key={n.id} onClick={()=>markRead(n.id)}
                style={{padding:'12px 16px',borderBottom:`1px solid ${BORDER}`,cursor:'pointer',background:n.read?'transparent':'rgba(212,160,23,.04)',transition:'background .15s'}}
                onMouseEnter={e=>(e.currentTarget.style.background=n.read?'rgba(255,255,255,.02)':'rgba(212,160,23,.07)')}
                onMouseLeave={e=>(e.currentTarget.style.background=n.read?'transparent':'rgba(212,160,23,.04)')}>
                <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{fontSize:18,lineHeight:1}}>{TYPE_ICONS[n.type]||TYPE_ICONS.default}</span>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                      <div style={{fontSize:13,fontWeight:n.read?600:700,color:n.read?DIM:TEXT,lineHeight:1.3}}>{n.title}</div>
                      <div style={{fontSize:10,color:DIM,whiteSpace:'nowrap' as const,marginTop:1}}>{timeAgo(n.created_at)}</div>
                    </div>
                    <div style={{fontSize:12,color:DIM,marginTop:3,lineHeight:1.4}}>{n.body}</div>
                  </div>
                  {!n.read&&<div style={{width:7,height:7,borderRadius:'50%',background:GOLD,flexShrink:0,marginTop:3}}/>}
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 16px',borderTop:`1px solid ${BORDER}`,textAlign:'center' as const}}>
            <button onClick={()=>setOpen(false)} style={{fontSize:12,color:DIM,background:'none',border:'none',cursor:'pointer'}}>View all notifications</button>
          </div>
        </div>
      )}
    </div>
  );
}

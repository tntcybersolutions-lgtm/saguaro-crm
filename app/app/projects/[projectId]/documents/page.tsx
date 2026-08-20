'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface Doc { id:string;file_name:string;file_url:string;file_size:number;category:string;description:string;version:number;created_at:string;file_type:string }

const CATEGORIES=['All','Contracts','Permits','Insurance','Reports','Drawings','Correspondence','Other']
const FILE_ICONS:{[k:string]:string}={'pdf':'📄','doc':'📝','docx':'📝','xls':'📊','xlsx':'📊','jpg':'🖼','jpeg':'🖼','png':'🖼','zip':'🗜','mp4':'🎥','default':'📎'}
const fmtSize=(b:number)=>b>1048576?`${(b/1048576).toFixed(1)}MB`:b>1024?`${(b/1024).toFixed(0)}KB`:`${b}B`

export default function DocumentsPage({ params }: { params: Promise<{projectId:string}> }) {
  const [projectId,setProjectId]=useState('')
  const [docs,setDocs]=useState<Doc[]>([])
  const [loading,setLoading]=useState(true)
  const [category,setCategory]=useState('All')
  const [search,setSearch]=useState('')
  const [uploading,setUploading]=useState(false)
  const [dragOver,setDragOver]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  const [upCat,setUpCat]=useState('Other')
  const [upDesc,setUpDesc]=useState('')

  useEffect(()=>{
    params.then(p=>{setProjectId(p.projectId);load(p.projectId)})
  },[params])

  const load=(pid:string,cat?:string)=>
    fetch(`/api/documents/project?projectId=${pid}${cat&&cat!=='All'?`&category=${cat.toLowerCase()}`:''}`)
      .then(r=>r.json()).then(d=>{setDocs(d.documents||[]);setLoading(false)})

  const upload=useCallback(async(files:FileList)=>{
    if(!files.length||!projectId) return
    setUploading(true)
    for(const file of Array.from(files)){
      const fd=new FormData()
      fd.append('file',file);fd.append('projectId',projectId)
      fd.append('category',upCat.toLowerCase());fd.append('description',upDesc)
      const res=await fetch('/api/documents/project',{method:'POST',body:fd})
      const d=await res.json()
      if(res.ok) setDocs(p=>{
        const others=p.filter(x=>x.file_name!==d.document.file_name)
        return [d.document,...others]
      })
    }
    setUploading(false);setUpDesc('')
  },[projectId,upCat,upDesc])

  const onDrop=useCallback((e:React.DragEvent)=>{
    e.preventDefault();setDragOver(false)
    if(e.dataTransfer.files.length) upload(e.dataTransfer.files)
  },[upload])

  const filtered=docs.filter(d=>{
    const matchCat=category==='All'||d.category===category.toLowerCase()
    const matchSearch=!search||d.file_name.toLowerCase().includes(search.toLowerCase())||d.description?.toLowerCase().includes(search.toLowerCase())
    return matchCat&&matchSearch
  })

  const getIcon=(fname:string)=>{
    const ext=fname.split('.').pop()?.toLowerCase()||'default'
    return FILE_ICONS[ext]||FILE_ICONS.default
  }

  // Group by file_name to show versions
  const grouped=filtered.reduce((acc,d)=>{
    const key=d.file_name;if(!acc[key])acc[key]=[];acc[key].push(d);return acc
  },{} as Record<string,Doc[]>)

  return (
    <div style={{padding:24,background:'#0f0f1a',minHeight:'100vh'}}
      onDragOver={e=>{e.preventDefault();setDragOver(true)}}
      onDragLeave={()=>setDragOver(false)} onDrop={onDrop}>

      {dragOver&&(
        <div style={{position:'fixed',inset:0,background:'rgba(212,160,23,0.1)',border:'3px dashed #D4A017',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:56}}>📁</div><div style={{color:'#D4A017',fontSize:20,fontWeight:900,marginTop:12}}>Drop documents here</div></div>
        </div>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:900,color:'#fff',margin:0}}>📁 Documents</h1>
          <p style={{color:'#666',fontSize:13,margin:'4px 0 0'}}>{docs.length} files</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <select value={upCat} onChange={e=>setUpCat(e.target.value)}
            style={{background:'#16213e',border:'1px solid #374151',borderRadius:7,padding:'7px 12px',color:'#888',fontSize:12}}>
            {CATEGORIES.filter(c=>c!=='All').map(c=><option key={c}>{c}</option>)}
          </select>
          <input ref={fileRef} type="file" multiple style={{display:'none'}} onChange={e=>e.target.files&&upload(e.target.files)}/>
          <button onClick={()=>fileRef.current?.click()} disabled={uploading}
            style={{background:uploading?'#333':'#D4A017',color:uploading?'#555':'#000',border:'none',borderRadius:8,padding:'9px 18px',fontWeight:700,cursor:uploading?'not-allowed':'pointer',fontSize:13}}>
            {uploading?'⏳ Uploading...':'+ Upload'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents..."
          style={{background:'#16213e',border:'1px solid #374151',borderRadius:8,padding:'8px 14px',color:'#fff',fontSize:13,width:240,outline:'none'}}/>
      </div>

      {/* Category tabs */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        {CATEGORIES.map(c=>(
          <button key={c} onClick={()=>{setCategory(c);if(c!=='All')load(projectId,c);else load(projectId)}}
            style={{background:'none',border:'none',cursor:'pointer',padding:'7px 14px',fontSize:12,fontWeight:category===c?700:400,color:category===c?'#fff':'#666',borderBottom:category===c?'2px solid #D4A017':'2px solid transparent',marginBottom:-1}}>
            {c}
          </button>
        ))}
      </div>

      {loading?(
        <div style={{color:'#555',textAlign:'center',padding:60}}>Loading...</div>
      ):filtered.length===0?(
        <div style={{textAlign:'center',padding:'60px 0'}}>
          <div style={{fontSize:52,marginBottom:12}}>📁</div>
          <div style={{color:'#ddd',fontSize:17,fontWeight:700,marginBottom:8}}>{docs.length===0?'No Documents Yet':'No Documents in This Category'}</div>
          <div style={{color:'#555',fontSize:13,marginBottom:20}}>Drag and drop files here, or click Upload.</div>
          {docs.length===0&&<button onClick={()=>fileRef.current?.click()} style={{background:'#D4A017',color:'#000',border:'none',borderRadius:8,padding:'9px 22px',fontWeight:700,cursor:'pointer'}}>Upload First Document →</button>}
        </div>
      ):(
        <div style={{background:'#16213e',borderRadius:12,border:'1px solid rgba(255,255,255,0.07)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#1a1a2e'}}>
                {['File','Category','Version','Size','Uploaded','Actions'].map(h=>(
                  <th key={h} style={{padding:'11px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([fname,versions],i)=>{
                const latest=versions[0]
                const ext=fname.split('.').pop()?.toLowerCase()||''
                return (
                  <tr key={fname} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:22}}>{getIcon(fname)}</span>
                        <div>
                          <div style={{fontSize:13,color:'#ddd',fontWeight:600}}>{fname}</div>
                          {latest.description&&<div style={{fontSize:11,color:'#555',marginTop:1}}>{latest.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{padding:'11px 16px'}}><span style={{fontSize:11,background:'rgba(255,255,255,0.06)',color:'#888',padding:'2px 7px',borderRadius:4,textTransform:'capitalize'}}>{latest.category}</span></td>
                    <td style={{padding:'11px 16px'}}>
                      <span style={{fontSize:11,background:latest.version>1?'rgba(212,160,23,0.15)':'rgba(255,255,255,0.05)',color:latest.version>1?'#D4A017':'#666',padding:'2px 7px',borderRadius:4,fontWeight:700}}>
                        v{latest.version}
                      </span>
                      {versions.length>1&&<span style={{fontSize:10,color:'#555',marginLeft:6}}>{versions.length} revisions</span>}
                    </td>
                    <td style={{padding:'11px 16px',color:'#555',fontSize:12}}>{fmtSize(latest.file_size||0)}</td>
                    <td style={{padding:'11px 16px',color:'#555',fontSize:12}}>{new Date(latest.created_at).toLocaleDateString()}</td>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <a href={latest.file_url} target="_blank" rel="noopener noreferrer"
                          style={{background:'rgba(96,165,250,0.1)',color:'#60A5FA',border:'1px solid rgba(96,165,250,0.2)',borderRadius:5,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:700,textDecoration:'none'}}>
                          View
                        </a>
                        <a href={latest.file_url} download={fname}
                          style={{background:'rgba(255,255,255,0.06)',color:'#888',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,padding:'4px 10px',cursor:'pointer',fontSize:11,textDecoration:'none'}}>
                          ⬇
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

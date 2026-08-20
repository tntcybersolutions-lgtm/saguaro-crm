'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const DOC_LABELS: Record<
  string,
  { label: string; icon: string; category: string }
> = {
  cover_page:              { label: 'Cover Page',               icon: '📋', category: 'Overview' },
  invitation_to_bid:       { label: 'Invitation to Bid',        icon: '✉️', category: 'Procurement' },
  instructions_to_bidders: { label: 'Instructions to Bidders',  icon: '📝', category: 'Procurement' },
  bid_form:                { label: 'Bid Proposal Form',        icon: '📊', category: 'Procurement' },
  scope_of_work:           { label: 'Scope of Work',            icon: '🔨', category: 'Technical' },
  schedule_of_values:      { label: 'Schedule of Values',       icon: '💰', category: 'Technical' },
  insurance_requirements:  { label: 'Insurance Requirements',   icon: '🛡️', category: 'Legal' },
  safety_requirements:     { label: 'Site Safety Requirements', icon: '⛑️', category: 'Legal' },
  submittal_requirements:  { label: 'Submittal Log',            icon: '📎', category: 'Technical' },
  drawing_log:             { label: 'Drawing Sheet Log',        icon: '📐', category: 'Technical' },
  project_schedule:        { label: 'Project Schedule',         icon: '📅', category: 'Schedule' },
  rfi_procedures:          { label: 'RFI Procedures',           icon: '❓', category: 'Procedures' },
  general_conditions:      { label: 'General Conditions',       icon: '⚖️', category: 'Legal' },
  pre_bid_agenda:          { label: 'Pre-Bid Meeting Agenda',   icon: '🗓️', category: 'Procedures' },
}

function labelFor(id: string): { label: string; icon: string; category: string } {
  return (
    DOC_LABELS[id] || {
      label: id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      icon: '📄',
      category: 'Other',
    }
  )
}

export default function JacketViewerPage() {
  const params = useParams<{ projectId: string; id: string }>()
  const projectId = params.projectId
  const packageId = params.id
  const router = useRouter()

  const [docs, setDocs] = useState<Array<{ id: string; title: string }>>([])
  const [activeDoc, setActiveDoc] = useState<string | null>(null)
  const [pkgName, setPkgName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/bid-packages/${packageId}/jacket-doc`)
      .then((r) => r.json())
      .then((d: { documents?: Array<{ id: string; title: string }>; package_name?: string }) => {
        const list = d.documents || []
        setDocs(list)
        setPkgName(d.package_name || '')
        if (list.length > 0) setActiveDoc(list[0].id)
      })
      .finally(() => setLoading(false))
  }, [packageId])

  const categories = Array.from(
    new Set(docs.map((d) => labelFor(d.id).category)),
  )

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 260,
          background: '#161b22',
          borderRight: '1px solid #21262d',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #21262d' }}>
          <button
            onClick={() =>
              router.push(`/app/projects/${projectId}/bid-packages`)
            }
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: 12,
              padding: '0 0 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ← Back to Packages
          </button>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
            {pkgName || 'Bid Jacket'}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>
            {docs.length} document{docs.length === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {categories.map((cat) => (
            <div key={cat}>
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: 9,
                  fontWeight: 800,
                  color: '#6e7681',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {cat}
              </div>
              {docs
                .filter((d) => labelFor(d.id).category === cat)
                .map((doc) => {
                  const meta = labelFor(doc.id)
                  const isActive = activeDoc === doc.id
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setActiveDoc(doc.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 16px',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        background: isActive
                          ? 'rgba(212,160,23,.1)'
                          : 'transparent',
                        borderLeft: isActive
                          ? '3px solid #D4A017'
                          : '3px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.icon}</span>
                      <span
                        style={{
                          fontSize: 12,
                          color: isActive ? '#D4A017' : '#8b949e',
                          fontWeight: isActive ? 700 : 400,
                        }}
                      >
                        {meta.label}
                      </span>
                    </button>
                  )
                })}
            </div>
          ))}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #21262d' }}>
          <button
            onClick={async () => {
              for (const doc of docs) {
                window.open(
                  `/api/bid-packages/${packageId}/jacket-doc?doc=${doc.id}`,
                  '_blank',
                )
                await new Promise((r) => setTimeout(r, 400))
              }
            }}
            disabled={docs.length === 0}
            style={{
              width: '100%',
              background: 'rgba(212,160,23,.1)',
              border: '1px solid rgba(212,160,23,.3)',
              borderRadius: 8,
              padding: '10px',
              color: '#D4A017',
              fontSize: 12,
              fontWeight: 700,
              cursor: docs.length === 0 ? 'not-allowed' : 'pointer',
              opacity: docs.length === 0 ? 0.5 : 1,
            }}
          >
            📂 Open All {docs.length} Document{docs.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            height: 44,
            background: '#161b22',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 16px',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>
            {activeDoc
              ? `${labelFor(activeDoc).icon} ${labelFor(activeDoc).label}`
              : 'Select a document'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {activeDoc && (
              <button
                onClick={() =>
                  window.open(
                    `/api/bid-packages/${packageId}/jacket-doc?doc=${activeDoc}`,
                    '_blank',
                  )
                }
                style={{
                  background: '#D4A017',
                  color: '#0d1117',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🖨️ Print / Save PDF
              </button>
            )}
          </div>
        </div>

        {activeDoc ? (
          <iframe
            key={activeDoc}
            src={`/api/bid-packages/${packageId}/jacket-doc?doc=${activeDoc}`}
            style={{ flex: 1, border: 'none', background: '#fff' }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6e7681',
            }}
          >
            {loading ? 'Loading documents...' : 'Select a document from the sidebar'}
          </div>
        )}
      </div>
    </div>
  )
}

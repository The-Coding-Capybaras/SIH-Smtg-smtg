import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Mic, Search, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import L from 'leaflet'

// Component to handle auto-zooming to the GeoJSON bounds
function GeoJSONWithZoom({ data }) {
  const map = useMap();
  const geoJsonRef = useRef();

  useEffect(() => {
    if (data && geoJsonRef.current) {
      const bounds = geoJsonRef.current.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
      }
    }
  }, [data, map]);

  return (
    <GeoJSON 
      key={JSON.stringify(data)} 
      data={data} 
      ref={geoJsonRef}
      style={{ color: '#10b981', weight: 3, fillColor: '#10b981', fillOpacity: 0.3 }}
    />
  );
}

function MapViewer({ geojson }) {
  return (
    <div className="absolute inset-0 z-0">
      <MapContainer center={[20.5937, 78.9629]} zoom={5} zoomControl={false} style={{ height: '100%', width: '100%', background: '#0b1326' }}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri"
        />
        {geojson && <GeoJSONWithZoom data={geojson} />}
      </MapContainer>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [traceSteps, setTraceSteps] = useState([])
  const [finalResult, setFinalResult] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSearch = () => {
    if (!query) return;
    setIsProcessing(true)
    setTraceSteps([])
    setFinalResult(null)

    const eventSource = new EventSource(`http://localhost:8000/api/query?q=${encodeURIComponent(query)}`)
    
    eventSource.addEventListener("trace", (e) => {
      const data = JSON.parse(e.data)
      setTraceSteps(prev => [...prev, data])
    })
    
    eventSource.addEventListener("result", (e) => {
      const data = JSON.parse(e.data)
      setFinalResult(data)
      setIsProcessing(false)
      eventSource.close()
    })
    
    eventSource.onerror = () => {
      eventSource.close()
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface font-sans text-[#dae2fd]">
      {/* Main Map Area */}
      <div className="relative flex-grow h-full">
        <MapViewer />
        
        {/* Top Navbar overlay */}
        <div className="absolute top-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
          <div className="text-2xl font-bold bg-[#0b1326]/80 px-4 py-2 rounded-md backdrop-blur pointer-events-auto border border-white/10 text-cyberBlue">
            SatQuery AI
          </div>
          
          <button className="bg-cyberBlue text-[#00354a] px-4 py-2 rounded font-semibold pointer-events-auto flex items-center gap-2 hover:bg-[#8ed5ff] transition">
            <Download size={18} /> Export ISRO Report
          </button>
        </div>

        {/* Floating Search Bar */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 pointer-events-auto w-[600px]">
          <div className="flex items-center bg-[#171f33]/90 backdrop-blur-md rounded-full border border-white/10 px-4 py-3 shadow-lg">
            <Search size={20} className="text-[#87929a] mr-3" />
            <input 
              type="text" 
              placeholder="Ask SatQuery about regional changes or object detection..." 
              className="bg-transparent flex-grow outline-none text-[#dae2fd] placeholder-[#87929a]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="p-2 hover:bg-white/10 rounded-full transition">
              <Mic size={20} className="text-cyberBlue" />
            </button>
            <button 
              onClick={handleSearch}
              disabled={isProcessing}
              className={`ml-2 px-4 py-1.5 rounded-full font-semibold transition ${isProcessing ? 'bg-white/10 text-white/50' : 'bg-cyberBlue text-[#00354a] hover:bg-[#8ed5ff]'}`}
            >
              {isProcessing ? 'Agent Running...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      {/* Execution Trace Sidebar */}
      <div className="w-[400px] h-full bg-[#060e20] border-l border-white/10 z-20 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-bold font-mono tracking-tight text-cyberBlue">Execution Trace</h2>
          <p className="text-sm text-[#87929a] mt-1">Real-time agentic orchestration logs</p>
        </div>
        
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          {traceSteps.length === 0 && !isProcessing && (
            <div className="text-center text-[#87929a] mt-10">
              Submit a query to see the agent execute.
            </div>
          )}
          
          {traceSteps.map((step, idx) => (
            <div key={idx} className="relative pl-6">
              {/* Vertical line */}
              {idx !== traceSteps.length - 1 && (
                <div className="absolute left-[11px] top-6 bottom-[-24px] w-[1px] bg-white/20"></div>
              )}
              
              {/* Dot */}
              <div className={`absolute left-0 top-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center ${step.status === 'success' ? 'bg-[#10b981]/20' : 'bg-cyberBlue/20 animate-pulse'}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${step.status === 'success' ? 'bg-[#10b981]' : 'bg-cyberBlue'}`}></div>
              </div>

              <div className="bg-[#131b2e] border border-white/5 rounded-md p-3 ml-2">
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-[14px] text-[#dae2fd]">{step.step}</span>
                  {step.confidence && (
                    <span className="text-[10px] bg-[#00a572]/20 text-[#4edea3] px-2 py-0.5 rounded font-mono border border-[#00a572]/30">
                      {Math.round(step.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Final Result Panel */}
          {finalResult && (
            <div className="mt-8 bg-[#171f33] border border-cyberBlue/30 rounded-lg p-5">
              <div className="text-xs uppercase tracking-widest text-[#87929a] mb-4 font-bold border-b border-white/10 pb-2">Analysis Output</div>
              
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {finalResult.answer}
                </ReactMarkdown>
              </div>

              {finalResult.intent && (
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-[#87929a]">Classified Intent:</span>
                  <span className="text-cyberBlue font-mono">{finalResult.intent.intent}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

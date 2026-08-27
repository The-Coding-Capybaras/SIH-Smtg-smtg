import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Mic, Search, Download, Upload, SlidersHorizontal, Map as MapIcon, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import L from 'leaflet'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import 'leaflet.heat'
import parseGeoraster from 'georaster'
import GeoRasterLayer from 'georaster-layer-for-leaflet'

// Ensure L is global for Geoman
window.L = L;
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

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

// Custom Heatmap Layer using leaflet.heat
function HeatmapLayer({ points }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!points || points.length === 0) return;
    
    // Create heat layer
    const validPoints = points.map(p => [p[0], p[1], (p[2] || 0.5) * 10]); // Scale intensity up for visibility
    const heat = L.heatLayer(validPoints, {
      radius: 40,
      blur: 25,
      maxZoom: 17,
      gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    });
    
    heat.addTo(map);
    layerRef.current = heat;

    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [points, map]);

  return null;
}

// Side-by-Side comparison tile layer via CSS clip-path
function ClippedTileLayer({ url, attribution, clipPercent }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!layerRef.current) {
      const layer = L.tileLayer(url, { attribution, crossOrigin: "anonymous", zIndex: 10 });
      layer.addTo(map);
      layerRef.current = layer;
    }
    
    // Update clip-path dynamically
    const container = layerRef.current.getContainer();
    if (container) {
      // clip from clipPercent to the right edge
      const poly = `polygon(${clipPercent}% 0, 100% 0, 100% 100%, ${clipPercent}% 100%)`;
      container.style.clipPath = poly;
      container.style.webkitClipPath = poly;
    }

    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [map, url, attribution, clipPercent]);

  return null;
}

// Geoman controls wrapper
function GeomanSetup({ onRegionSelected }) {
  const map = useMap();

  useEffect(() => {
    if (!map.pm) return;
    
    map.pm.addControls({
      position: 'bottomleft',
      drawCircle: false,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawPolygon: true,
      drawRectangle: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
    });

    map.on('pm:create', (e) => {
      const geojson = e.layer.toGeoJSON();
      onRegionSelected(geojson);
      
      // Cleanup on remove
      e.layer.on('pm:remove', () => {
        onRegionSelected(null);
      });
    });

    return () => {
      if (map.pm) map.pm.removeControls();
      map.off('pm:create');
    };
  }, [map, onRegionSelected]);

  return null;
}

function MapViewer({ geojson, heatmap, isComparison, clipPercent, userGeotiff, onRegionSelected }) {
  const mapRef = useRef(null);
  
  useEffect(() => {
    if (userGeotiff && mapRef.current) {
      const map = mapRef.current;
      const layer = new GeoRasterLayer({
        georaster: userGeotiff,
        opacity: 0.7,
        resolution: 256
      });
      layer.addTo(map);
      map.fitBounds(layer.getBounds());
    }
  }, [userGeotiff]);

  return (
    <div id="map-capture-area" className="absolute inset-0 z-0 overflow-hidden">
      <MapContainer center={[20.5937, 78.9629]} zoom={5} zoomControl={false} style={{ height: '100%', width: '100%', background: '#0b1326' }} preferCanvas={true} ref={mapRef}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri"
          crossOrigin="anonymous"
          zIndex={1}
        />
        
        <GeomanSetup onRegionSelected={onRegionSelected} />
        
        {isComparison && (
          <ClippedTileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="OpenStreetMap"
            clipPercent={clipPercent}
          />
        )}

        {heatmap && heatmap.length > 0 && <HeatmapLayer points={heatmap} />}
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
  const [isExporting, setIsExporting] = useState(false)
  const [clipPercent, setClipPercent] = useState(50)
  const [userGeotiff, setUserGeotiff] = useState(null)
  const [selectedRegion, setSelectedRegion] = useState(null)
  
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const georaster = await parseGeoraster(arrayBuffer);
      setUserGeotiff(georaster);
      alert("GeoTIFF successfully parsed and loaded to map.");
    }
  };

  const handleExportPDF = async () => {
    if (!finalResult) {
      alert("Please run a query first to generate an analysis.");
      return;
    }
    
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      
      // ISRO Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(0, 53, 74);
      doc.text("ISRO Geospatial Intelligence Report", 20, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated by SatQuery AI | Date: ${new Date().toLocaleString()}`, 20, 28);
      
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 32, 190, 32);

      // Query Details
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("Target Query:", 20, 42);
      doc.setFont("helvetica", "normal");
      
      const splitQuery = doc.splitTextToSize(query, 140);
      doc.text(splitQuery, 52, 42);

      doc.setFont("helvetica", "bold");
      doc.text("Classified Intent:", 20, 52);
      doc.setFont("helvetica", "normal");
      doc.text(finalResult.intent?.intent || "UNKNOWN", 62, 52);
      
      let currentY = 62;

      // Try capturing map
      const mapElement = document.getElementById("map-capture-area");
      if (mapElement) {
        const canvas = await html2canvas(mapElement, { 
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#0b1326'
        });
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 20, currentY, 170, 90);
        currentY += 100;
      }

      // Add Analysis text
      doc.setFont("helvetica", "bold");
      doc.text("Agentic Analysis Output:", 20, currentY);
      currentY += 10;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      
      // Strip markdown formatting characters for plain text PDF
      const plainText = finalResult.answer.replace(/[*#_`]/g, '');
      const splitText = doc.splitTextToSize(plainText, 170);
      
      // Handle pagination if text is too long
      for (let i = 0; i < splitText.length; i++) {
        if (currentY > 280) {
          doc.addPage();
          currentY = 20;
        }
        doc.text(splitText[i], 20, currentY);
        currentY += 5;
      }

      doc.save(`ISRO_Report_${Date.now()}.pdf`);
    } catch (e) {
      console.error("PDF Export failed:", e);
      alert("Failed to export PDF. Check console.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSearch = () => {
    if (!query) return;
    setIsProcessing(true)
    setTraceSteps([])
    setFinalResult(null)
    setClipPercent(50)

    let finalQuery = query;
    if (selectedRegion) {
      // Append the bounding box coordinates to help the LLM
      finalQuery += ` [Target Bounds: ${JSON.stringify(selectedRegion.geometry)}]`;
    }

    const eventSource = new EventSource(`http://localhost:8000/api/query?q=${encodeURIComponent(finalQuery)}`)
    
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
    
    eventSource.addEventListener('error', () => {
      setTraceSteps(prev => [...prev, { step: "Error communicating with SatQuery Orchestrator", status: "error" }])
      setIsProcessing(false)
      eventSource.close()
    })
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface font-sans text-[#dae2fd]">
      {/* Main Map Area */}
      <div className="relative flex-grow h-full">
        <MapViewer 
          geojson={finalResult?.geojson} 
          heatmap={finalResult?.heatmap}
          isComparison={finalResult?.is_comparison}
          clipPercent={clipPercent}
          userGeotiff={userGeotiff}
          onRegionSelected={setSelectedRegion}
        />
        
        {/* Top Navbar overlay */}
        <div className="absolute top-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
          <div className="text-2xl font-bold bg-[#0b1326]/80 px-4 py-2 rounded-md backdrop-blur pointer-events-auto border border-white/10 text-cyberBlue">
            SatQuery AI
          </div>
          
          <button 
            onClick={handleExportPDF}
            disabled={isExporting || !finalResult}
            className={`px-4 py-2 rounded font-semibold pointer-events-auto flex items-center gap-2 transition ${isExporting || !finalResult ? 'bg-white/10 text-white/50 cursor-not-allowed' : 'bg-cyberBlue text-[#00354a] hover:bg-[#8ed5ff]'}`}>
            <Download size={18} /> {isExporting ? 'Generating...' : 'Export ISRO Report'}
          </button>
        </div>

        {/* Floating Search Bar */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 pointer-events-auto w-[600px] flex flex-col gap-2">
          
          {selectedRegion && (
            <div className="self-center bg-[#10b981]/20 border border-[#10b981]/40 text-[#10b981] px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 backdrop-blur-md">
              <MapIcon size={14} /> Custom bounding box drawn on map
              <button onClick={() => window.location.reload()} className="hover:text-white transition">
                <X size={14} />
              </button>
            </div>
          )}

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
            
            <label className="p-2 hover:bg-white/10 rounded-full transition cursor-pointer" title="Upload GeoTIFF">
              <Upload size={20} className="text-[#87929a] hover:text-emeraldGreen" />
              <input type="file" accept=".tif,.tiff" className="hidden" onChange={handleFileUpload} />
            </label>
            
            <button 
              onClick={handleSearch}
              disabled={isProcessing}
              className={`ml-2 px-4 py-1.5 rounded-full font-semibold transition ${isProcessing ? 'bg-white/10 text-white/50' : 'bg-cyberBlue text-[#00354a] hover:bg-[#8ed5ff]'}`}
            >
              {isProcessing ? 'Agent Running...' : 'Search'}
            </button>
          </div>
          
          {/* Comparison Slider UI */}
          {finalResult?.is_comparison && (
            <div className="bg-[#171f33]/90 backdrop-blur-md rounded-lg border border-white/10 p-3 shadow-lg flex items-center gap-3">
              <SlidersHorizontal size={16} className="text-emeraldGreen" />
              <span className="text-xs font-semibold text-[#87929a] uppercase tracking-wider">Swipe Compare</span>
              <input 
                type="range" 
                min="0" max="100" 
                value={clipPercent} 
                onChange={(e) => setClipPercent(e.target.value)} 
                className="w-full h-2 bg-[#0b1326] rounded-lg appearance-none cursor-pointer" 
              />
            </div>
          )}
        </div>
      </div>

      {/* Execution Trace Sidebar */}
      <div className="w-[400px] flex-shrink-0 h-full bg-[#060e20] border-l border-white/10 z-20 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-bold font-mono tracking-tight text-cyberBlue">Execution Trace</h2>
          <p className="text-sm text-[#87929a] mt-1">Real-time agentic orchestration logs</p>
        </div>
        
        <div className="flex-grow overflow-y-auto overflow-x-hidden p-6 space-y-6">
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
                  <span className="font-semibold text-[14px] text-[#dae2fd] break-words pr-2">{step.step}</span>
                  {step.confidence && (
                    <span className="text-[10px] bg-[#00a572]/20 text-[#4edea3] px-2 py-0.5 rounded font-mono border border-[#00a572]/30 whitespace-nowrap">
                      {Math.round(step.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Final Result Panel */}
          {finalResult && (
            <div className="mt-8 bg-[#171f33] border border-cyberBlue/30 rounded-lg p-5 w-full overflow-hidden">
              <div className="text-xs uppercase tracking-widest text-[#87929a] mb-4 font-bold border-b border-white/10 pb-2">Analysis Output</div>
              
              <div className="prose prose-sm prose-invert max-w-full overflow-x-auto">
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

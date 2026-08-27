import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Mic, Search, Download, Upload, SlidersHorizontal, Map as MapIcon, X, Network, FileImage, Layers } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import L from 'leaflet'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import 'leaflet.heat'
import parseGeoraster from 'georaster'
import GeoRasterLayer from 'georaster-layer-for-leaflet'
import * as turf from '@turf/turf'

// Ensure L is global for Geoman
window.L = L;
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

// [Previous map components: GeoJSONWithZoom, HeatmapLayer, ClippedTileLayer, GeomanSetup, MapViewer] ...
// I will keep these as they are, but re-inject them correctly.
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

function HeatmapLayer({ points }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!points || points.length === 0) return;
    const validPoints = points.map(p => [p[0], p[1], (p[2] || 0.5) * 10]); 
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

import 'leaflet-side-by-side';

function SplitMap({ leftUrl, rightUrl }) {
  const map = useMap();

  useEffect(() => {
    // Add layers
    const leftLayer = L.tileLayer(leftUrl, { crossOrigin: "anonymous", zIndex: 5 }).addTo(map);
    const rightLayer = L.tileLayer(rightUrl, { crossOrigin: "anonymous", zIndex: 6 }).addTo(map);
    
    // Create the side-by-side control
    const control = L.control.sideBySide(leftLayer, rightLayer);
    control.addTo(map);

    return () => {
      if (control) control.remove();
      if (leftLayer) leftLayer.remove();
      if (rightLayer) rightLayer.remove();
    };
  }, [map, leftUrl, rightUrl]);

  return null;
}

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
      try {
        const area = turf.area(geojson);
        geojson.areaSqKm = (area / 1000000).toFixed(2);
      } catch (err) {
        geojson.areaSqKm = "0.00";
      }
      onRegionSelected(geojson);
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



// 3D Extrusion Layer
function OSMBuildingsLayer() {
  const map = useMap();
  const layerRef = useRef(null);
  
  useEffect(() => {
    // OSMBuildings modifies the map. Need to ensure it only initializes once
    try {
      const osmb = new window.OSMBuildings(map).load('https://{s}.data.osmbuildings.org/0.2/anonymous/tile/{z}/{x}/{y}.json');
      layerRef.current = osmb;
    } catch (e) {
      console.error("OSMBuildings failed to load", e);
    }
    
    return () => {
      if (layerRef.current && typeof layerRef.current.destroy === 'function') {
        try { layerRef.current.destroy(); } catch(e){}
      }
    };
  }, [map]);

  return null;
}

// SatLapse Time-Series Animation
function SatLapseLayer() {
  const map = useMap();
  
  useEffect(() => {
    // Create a stack of historical layers
    const layers = [
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { zIndex: 7, opacity: 1 }), // Current
      L.tileLayer('https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/44628/{z}/{y}/{x}', { zIndex: 8, opacity: 0 }), // 2018 (mock format)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { zIndex: 9, opacity: 0 }) // Base
    ];
    
    layers.forEach(l => l.addTo(map));
    
    let currentIdx = 0;
    const interval = setInterval(() => {
      layers.forEach(l => l.setOpacity(0)); // Hide all
      layers[currentIdx].setOpacity(1); // Show next
      currentIdx = (currentIdx + 1) % layers.length;
    }, 800); // 800ms per frame
    
    return () => {
      clearInterval(interval);
      layers.forEach(l => map.removeLayer(l));
    };
  }, [map]);
  
  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-[#0b1326]/90 backdrop-blur-md px-6 py-3 rounded-full border border-cyberBlue flex items-center gap-4 text-cyberBlue font-bold shadow-[0_0_15px_rgba(0,165,114,0.3)]">
      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
      SatLapse: Historical Temporal Animation Active
    </div>
  );
}

function MapViewer({ geojson, heatmap, isComparison, isTimelapse, is3D, clipPercent, userGeotiff, sarGeotiff, onRegionSelected }) {
  const mapRef = useRef(null);
  
  // Optical Geotiff Layer
  useEffect(() => {
    if (userGeotiff && mapRef.current) {
      const map = mapRef.current;
      const layer = new GeoRasterLayer({
        georaster: userGeotiff,
        opacity: 0.8,
        resolution: 256
      });
      layer.addTo(map);
      map.fitBounds(layer.getBounds());
    }
  }, [userGeotiff]);

  // SAR Geotiff Layer
  useEffect(() => {
    if (sarGeotiff && mapRef.current) {
      const map = mapRef.current;
      const layer = new GeoRasterLayer({
        georaster: sarGeotiff,
        opacity: 0.5,
        resolution: 256,
      });
      layer.addTo(map);
      map.fitBounds(layer.getBounds());
    }
  }, [sarGeotiff]);

  return (
    <div id="map-capture-area" className="absolute inset-0 z-0 overflow-hidden">
      <MapContainer center={[20.5937, 78.9629]} zoom={5} zoomControl={false} style={{ height: '100%', width: '100%', background: '#0b1326' }} preferCanvas={true} ref={mapRef}>
        
        {isComparison ? (
          <SplitMap 
            leftUrl="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            rightUrl="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri"
            crossOrigin="anonymous"
            zIndex={1}
          />
        )}
        
        <GeomanSetup onRegionSelected={onRegionSelected} />
        {heatmap && heatmap.length > 0 && <HeatmapLayer points={heatmap} />}
        {geojson && <GeoJSONWithZoom data={geojson} />}
        {is3D && <OSMBuildingsLayer />}
        {isTimelapse && <SatLapseLayer />}
      </MapContainer>
    </div>
  )
}

function ExecutionFlowchart({ intent }) {
  if (!intent) return null;

  // Determine the dynamic models chosen based on intent
  const routing = {
    "CHANGE_DETECTION": ["BigEarthNet-Base", "ChangeFormer-VQA"],
    "VISUAL_GROUNDING": ["BigEarthNet-Base", "Geo-Grounding-Net"],
    "OPTICAL_SAR_FUSION": ["BigEarthNet-Base", "SAR-Optical-Fusion-Transformer"],
    "GENERAL": ["BigEarthNet-Base", "LLaVA-Geo-VQA"]
  };

  const models = routing[intent] || routing["GENERAL"];

  return (
    <div className="mt-6 bg-[#131b2e] border border-white/10 rounded-lg p-4">
      <div className="text-xs uppercase tracking-widest text-[#87929a] mb-4 font-bold flex items-center gap-2 border-b border-white/10 pb-2">
        <Network size={14} /> Auditable Orchestration Flow
      </div>
      
      <div className="flex flex-col items-center gap-2 my-4">
        {/* Input */}
        <div className="bg-[#060e20] border border-white/20 text-[#dae2fd] text-xs px-3 py-1.5 rounded">User Query + Inputs</div>
        
        <div className="h-4 w-px bg-white/20"></div>
        
        {/* Intent Parser */}
        <div className="bg-[#0b1326] border border-cyberBlue text-cyberBlue text-xs font-mono px-3 py-1.5 rounded text-center">
          Groq Orchestrator
          <div className="text-[10px] text-[#87929a] mt-0.5">Intent: {intent}</div>
        </div>

        <div className="h-4 w-px bg-white/20"></div>
        
        {/* Dynamic Model Routing */}
        <div className="flex gap-2">
          {models.map(model => (
            <div key={model} className="bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-xs px-3 py-1.5 rounded">
              {model}
            </div>
          ))}
        </div>

        <div className="h-4 w-px bg-white/20"></div>

        {/* Output */}
        <div className="bg-[#060e20] border border-white/20 text-[#dae2fd] text-xs px-3 py-1.5 rounded flex items-center gap-1">
          <Layers size={12} /> Spatial Result & Report
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState('')
  const [traceSteps, setTraceSteps] = useState([])
  const [finalResult, setFinalResult] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [clipPercent, setClipPercent] = useState(50)
  
  const [userGeotiff, setUserGeotiff] = useState(null)
  const [sarGeotiff, setSarGeotiff] = useState(null)
  const [selectedRegion, setSelectedRegion] = useState(null)
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  const handleOpticalUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const ab = await file.arrayBuffer();
      const georaster = await parseGeoraster(ab);
      setUserGeotiff(georaster);
    }
  };

  const handleSARUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const ab = await file.arrayBuffer();
      const georaster = await parseGeoraster(ab);
      setSarGeotiff(georaster);
    }
  };

  const handleExportPDF = async () => {
    // ... same as before
    if (!finalResult) {
      alert("Please run a query first to generate an analysis.");
      return;
    }
    
    setIsExporting(true);
    try {
      const doc = new jsPDF();
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

      doc.setFont("helvetica", "bold");
      doc.text("Agentic Analysis Output:", 20, currentY);
      currentY += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      
      const plainText = finalResult.answer.replace(/[*#_`]/g, '');
      const splitText = doc.splitTextToSize(plainText, 170);
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
      finalQuery += ` [Target Bounds: ${JSON.stringify(selectedRegion.geometry)}]`;
    }
    if (sarGeotiff && userGeotiff) {
      finalQuery += ` [Task: Co-registered Optical-SAR Fusion Analysis Required]`;
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
    
    eventSource.addEventListener("error", () => {
      setTraceSteps(prev => [...prev, { step: "Error communicating with SatQuery Orchestrator", status: "error" }])
      setIsProcessing(false)
      eventSource.close()
    })
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface font-sans text-[#dae2fd]">
      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className="bg-[#0b1326] border border-white/10 rounded-xl p-8 w-[600px] shadow-2xl relative">
            <button onClick={() => setIsUploadModalOpen(false)} className="absolute top-4 right-4 text-[#87929a] hover:text-white">
              <X size={20} />
            </button>
            <h2 className="text-2xl text-cyberBlue font-bold mb-2">Dataset Configuration</h2>
            <p className="text-sm text-[#87929a] mb-6">Upload co-registered image pairs for advanced multitemporal or cross-modal analysis.</p>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Optical Upload */}
              <div className="border border-dashed border-white/20 rounded-lg p-6 flex flex-col items-center justify-center bg-[#131b2e] hover:border-cyberBlue transition cursor-pointer relative">
                <FileImage size={32} className="text-cyberBlue mb-3" />
                <span className="text-sm font-semibold mb-1">Optical/Multispectral</span>
                <span className="text-xs text-[#87929a] text-center">Supported: GeoTIFF (.tif)</span>
                {userGeotiff && <div className="absolute inset-0 bg-emeraldGreen/20 border border-emeraldGreen rounded-lg flex items-center justify-center font-bold text-emeraldGreen">Loaded</div>}
                <input type="file" accept=".tif,.tiff" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleOpticalUpload} />
              </div>
              
              {/* SAR Upload */}
              <div className="border border-dashed border-white/20 rounded-lg p-6 flex flex-col items-center justify-center bg-[#131b2e] hover:border-[#10b981] transition cursor-pointer relative">
                <Layers size={32} className="text-[#10b981] mb-3" />
                <span className="text-sm font-semibold mb-1">Synthetic Aperture Radar</span>
                <span className="text-xs text-[#87929a] text-center">Requires Co-registration</span>
                {sarGeotiff && <div className="absolute inset-0 bg-emeraldGreen/20 border border-emeraldGreen rounded-lg flex items-center justify-center font-bold text-emeraldGreen">Loaded</div>}
                <input type="file" accept=".tif,.tiff" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleSARUpload} />
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button onClick={() => setIsUploadModalOpen(false)} className="bg-cyberBlue text-[#00354a] font-bold px-6 py-2 rounded">
                Confirm Inputs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Map Area */}
      <div className="relative flex-grow h-full">
        <MapViewer 
          geojson={finalResult?.geojson} 
          heatmap={finalResult?.heatmap}
          isComparison={finalResult?.is_comparison}
          isTimelapse={finalResult?.is_timelapse}
          is3D={finalResult?.is_3d}
          clipPercent={clipPercent}
          userGeotiff={userGeotiff}
          sarGeotiff={sarGeotiff}
          onRegionSelected={setSelectedRegion}
        />
        
        {/* Top Navbar */}
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
            <div className="self-center bg-[#10b981]/20 border border-[#10b981]/40 text-[#10b981] px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-3 backdrop-blur-md shadow-lg">
              <MapIcon size={14} /> 
              <span>Custom bounding box drawn</span>
              <span className="bg-[#10b981]/20 px-2 py-0.5 rounded border border-[#10b981]/30 text-[10px]">
                Area: {selectedRegion.areaSqKm} km²
              </span>
              <button onClick={() => window.location.reload()} className="hover:text-white transition bg-black/20 p-1 rounded-full ml-1">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex items-center bg-[#171f33]/90 backdrop-blur-md rounded-full border border-white/10 px-4 py-3 shadow-lg">
            <Search size={20} className="text-[#87929a] mr-3" />
            <input 
              type="text" 
              placeholder="Ask SatQuery about regional changes, object detection, or optical-SAR fusion..." 
              className="bg-transparent flex-grow outline-none text-[#dae2fd] placeholder-[#87929a]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            
            <button 
              className="p-2 hover:bg-white/10 rounded-full transition" 
              title="Configure Input Datasets"
              onClick={() => setIsUploadModalOpen(true)}
            >
              <Upload size={20} className="text-[#87929a] hover:text-emeraldGreen" />
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
      <div className="w-[420px] flex-shrink-0 h-full bg-[#060e20] border-l border-white/10 z-20 flex flex-col">
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
              {idx !== traceSteps.length - 1 && (
                <div className="absolute left-[11px] top-6 bottom-[-24px] w-[1px] bg-white/20"></div>
              )}
              
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

          {/* Render the Execution Architecture Flowchart if intent is parsed */}
          {finalResult?.intent && (
            <ExecutionFlowchart intent={finalResult.intent.intent} />
          )}

          {/* War Room Debate Panel */}
          {finalResult?.war_room_logs && finalResult.war_room_logs.length > 0 && (
            <div className="mt-6 bg-[#171f33] border border-orange-500/30 rounded-lg p-5 w-full overflow-hidden">
              <div className="text-xs uppercase tracking-widest text-[#87929a] mb-4 font-bold border-b border-white/10 pb-2 text-orange-400">War Room Debate Live Feed</div>
              
              <div className="flex flex-col gap-4">
                {finalResult.war_room_logs.map((log, i) => (
                  <div key={i} className="bg-[#0b1326] p-3 rounded border border-white/5">
                    <div className="text-xs text-cyberBlue font-bold mb-1">{log.agent}</div>
                    <div className="text-sm text-[#dae2fd]">{log.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Result Panel */}
          {finalResult && (
            <div className="mt-6 bg-[#171f33] border border-cyberBlue/30 rounded-lg p-5 w-full overflow-hidden">
              <div className="text-xs uppercase tracking-widest text-[#87929a] mb-4 font-bold border-b border-white/10 pb-2">Analysis Output</div>
              
              <div className="prose prose-sm prose-invert max-w-full overflow-x-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {finalResult.answer}
                </ReactMarkdown>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-[#87929a]">Classified Intent:</span>
                <span className="text-cyberBlue font-mono">{finalResult.intent.intent}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

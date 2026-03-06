import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import AssetDetail from './pages/AssetDetail';
import DigitalTwin from './pages/DigitalTwin';
import Analytics from './pages/Analytics';
import IncidentManagement from './pages/IncidentManagement';
import CityComparison from './pages/CityComparison';
import ScenarioBuilder from './pages/ScenarioBuilder';
import FailureReplay from './pages/FailureReplay';
import LiveStream from './pages/LiveStream';
import BridgeCAD from './pages/BridgeCAD';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="asset" element={<AssetDetail />} />
          <Route path="asset/:assetId" element={<AssetDetail />} />
          <Route path="digital-twin" element={<DigitalTwin />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="incidents" element={<IncidentManagement />} />
          <Route path="/city-comparison" element={<CityComparison />} />
          <Route path="/scenario-builder" element={<ScenarioBuilder />} />
          <Route path="/failure-replay" element={<FailureReplay />} />
          <Route path="/live-stream" element={<LiveStream />} />
          <Route path="/bridge-cad" element={<BridgeCAD />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

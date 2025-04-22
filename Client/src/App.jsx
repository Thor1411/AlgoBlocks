import "./App.css";
import Backtesting from "./StrategyMaker";
import Testing from "./Backtester";
import Testing2 from "./Livetester";
import Home from "./Home";
import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/testing" element={<Testing />} />
        <Route path="/testing2" element={<Testing2 />} />
        <Route path="/builder" element={<Backtesting />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

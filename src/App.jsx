import { BrowserRouter, Route, Routes } from "react-router-dom";
import Main_Page from "./Main_Page";
import Login from "./Login";

// export const serverRoute = "http://localhost:8080";
export const serverRoute = "https://bop-bnk-ser.onrender.com";
export const token = localStorage.getItem("token");
function App() {
  return (
    <div className="min-h-screen w-full">
      <BrowserRouter>
        <Routes>
          <Route element={<Main_Page />} path="/" />
          <Route element={<Login />} path="/login" />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;

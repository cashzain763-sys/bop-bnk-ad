// src/Login.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";


export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg("");

    // Hardcoded credential check (replace with your own logic if needed)
    if (username === "P" && password === "Karam12345") {
      // Generate a random token string (no real JWT)
      const randomToken = Math.random().toString(36).slice(2);
      localStorage.setItem("token", randomToken);
      return navigate('/')
    } else {
      setErrorMsg("Invalid username or password");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-100 p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-lg">
        <h3 className="w-full font-bold text-2xl text-center text-gray-900">
          Palestine Bank Admin
        </h3>
        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col items-stretch gap-4"
        >
          {errorMsg && (
            <div className="w-full text-center text-red-500" role="alert">
              {errorMsg}
            </div>
          )}
          <div className="flex w-full flex-col gap-2">
            <label className="text-xl text-gray-800">Username</label>
            <input
              type="text"
              className="form-control w-full rounded-lg bg-gray-200 p-2 text-lg"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <label className="text-xl text-gray-800">Password</label>
            <input
              type="password"
              className="form-control w-full rounded-lg bg-gray-200 p-2 text-lg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-md bg-blue-700 px-5 py-2.5 text-white"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}


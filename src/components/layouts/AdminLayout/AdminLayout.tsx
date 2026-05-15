import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BarChartOutlined,
  BookOutlined,
  LogoutOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  StarOutlined,
  ThunderboltOutlined,
  TagOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../../../app/hooks";
import { clearAccessToken } from "../../../services/axiosClient";
import logoImage from "../../../asset/logo.jpg";

const navItems = [
  {
    to: "/admin/stats",
    label: "Thống kê",
    icon: <BarChartOutlined />,
  },
  {
    to: "/admin/books",
    label: "Quản lý sách",
    icon: <BookOutlined />,
  },
  {
    to: "/admin/vouchers",
    label: "Quản lý mã",
    icon: <TagOutlined />,
  },
  {
    to: "/admin/reviews",
    label: "Duyệt đánh giá",
    icon: <StarOutlined />,
  },
  {
    to: "/admin/accounts",
    label: "Quản lý tài khoản",
    icon: <TeamOutlined />,
  },
  {
    to: "/admin/flash-sale",
    label: "Flash sale",
    icon: <ThunderboltOutlined />,
  },
] as const;

export default function AdminLayout() {
  const displayName = useAppSelector((state) => state.session.displayName);
  const primaryRole = useAppSelector((state) => state.session.primaryRole);
  const location = useLocation();
  const navigate = useNavigate();

  const placeholder = useMemo(() => {
    if (location.pathname === "/admin/books") {
      return "Tìm kiếm sách theo tên, tác giả, thể loại...";
    }
    if (location.pathname === "/admin/flash-sale") {
      return "Tìm kiếm chiến dịch flash sale...";
    }
    if (location.pathname === "/admin/flash-sale/new/select") {
      return "Tìm kiếm sách để thêm vào chiến dịch...";
    }
    return "Tìm kiếm...";
  }, [location.pathname]);

  const searchEnabled = useMemo(() => {
    return (
      location.pathname === "/admin/books" ||
      location.pathname === "/admin/flash-sale" ||
      location.pathname === "/admin/flash-sale/new/select"
    );
  }, [location.pathname]);

  const [searchInput, setSearchInput] = useState(() => {
    return new URLSearchParams(location.search).get("q") ?? "";
  });

  useEffect(() => {
    const next = new URLSearchParams(location.search).get("q") ?? "";
    setSearchInput(next);
  }, [location.search]);

  useEffect(() => {
    if (!searchEnabled) return;
    const timer = setTimeout(() => {
      applySearchToUrl(searchInput);
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchEnabled, searchInput]);

  const applySearchToUrl = (raw: string) => {
    const q = raw.trim();
    const params = new URLSearchParams(location.search);
    if (q) params.set("q", q);
    else params.delete("q");
    const nextSearch = params.toString();
    const current = location.search.startsWith("?")
      ? location.search.slice(1)
      : location.search;
    if (nextSearch === current) return;
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  };

  const handleLogout = () => {
    clearAccessToken();
    navigate("/login", { replace: true });
  };

  const roleLabel = useMemo(() => {
    const normalized = String(primaryRole || "")
      .trim()
      .toUpperCase();
    if (!normalized) return "Administrator";
    if (normalized === "ADMIN") return "Administrator";
    if (normalized === "STAFF") return "Staff";
    if (normalized === "MANAGER") return "Manager";
    return normalized;
  }, [primaryRole]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-384">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-5 lg:flex overflow-y-auto">
          <Link to="/admin/stats" className="flex items-center gap-3 px-2">
            <img
              src={logoImage}
              alt="Sách Xanh"
              className="h-14 w-auto object-contain"
            />

            <div className="text-sm font-extrabold uppercase tracking-wide text-teal-900">
              Admin
            </div>
          </Link>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isActive
                      ? "bg-teal-50 text-teal-900 ring-1 ring-teal-200"
                      : "text-gray-600 hover:bg-gray-50 hover:text-teal-900",
                  ].join(" ")
                }
              >
                <span className="text-lg text-teal-700">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto space-y-2 pt-6">
            <Link
              to="/admin/books"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              <PlusOutlined />
              Thêm sách mới
            </Link>

            <Link
              to="/admin/settings"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <SettingOutlined />
              Cài đặt
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              <LogoutOutlined />
              Đăng xuất
            </button>

            <div className="pt-2 text-center text-xs text-gray-400">
              © {new Date().getFullYear()} Sách Xanh
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-384 items-center gap-4 px-4 py-4 md:px-8">
              <Link
                to="/admin/stats"
                className="inline-flex items-center lg:hidden"
              >
                <img
                  src={logoImage}
                  alt="Sách Xanh"
                  className="h-14 w-auto object-contain"
                />
              </Link>

              {searchEnabled ? (
                <div className="flex-1">
                  <Input
                    size="large"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        applySearchToUrl(searchInput);
                      }
                    }}
                    placeholder={placeholder}
                    prefix={<SearchOutlined className="mr-2 text-gray-400" />}
                    className="rounded-full bg-gray-50 px-6 py-2 hover:border-teal-700! focus-within:border-teal-700! focus-within:bg-white! focus-within:shadow-[0_0_0_2px_rgba(15,118,110,0.2)]!"
                  />
                </div>
              ) : (
                <div className="flex-1" />
              )}

              <div className="hidden items-center gap-3 sm:flex">
                <div className="text-right leading-tight">
                  <div className="text-sm font-bold text-gray-900">
                    {displayName || "Admin"}
                  </div>
                  <div className="text-xs font-semibold text-gray-500">
                    {roleLabel}
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-sm font-extrabold text-teal-800 ring-1 ring-teal-100">
                  {(displayName || "A").slice(0, 1).toUpperCase()}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 overflow-x-auto px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

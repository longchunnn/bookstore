import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UnlockOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { toast } from "react-toastify";
import {
  createUserAccount,
  getUsersForStaff,
  updateUserAccount,
} from "../../services/usersService";
import type { ApiUser } from "../../utils/apiMappers";

const STAFF_ROLE_ID = 2;
const CUSTOMER_ROLE_ID = 3;
const ACTIVE_STATUS = 1;
const LOCKED_STATUS = 0;
const ACCOUNTS_PAGE_SIZE = 7;

type AccountTab = "staff" | "customers";

type StaffForm = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
};

const emptyStaffForm: StaffForm = {
  fullName: "",
  username: "",
  email: "",
  phone: "",
  password: "",
};

function statusLabel(status?: number) {
  return status === LOCKED_STATUS ? "Đã khóa" : "Đang hoạt động";
}

function statusClass(status?: number) {
  return status === LOCKED_STATUS
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function accountName(user: ApiUser) {
  return user.full_name || user.username || `User #${user.id}`;
}

export default function AdminAccountsPage() {
  const [activeTab, setActiveTab] = useState<AccountTab>("staff");
  const [staffAccounts, setStaffAccounts] = useState<ApiUser[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState<StaffForm>(emptyStaffForm);
  const [creating, setCreating] = useState(false);

  const visibleAccounts = activeTab === "staff" ? staffAccounts : customerAccounts;
  const activeCount = visibleAccounts.filter((user) => user.status !== LOCKED_STATUS).length;
  const lockedCount = visibleAccounts.filter((user) => user.status === LOCKED_STATUS).length;

  const filteredAccounts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return visibleAccounts;
    return visibleAccounts.filter((user) => {
      return [user.full_name, user.username, user.email, user.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [searchTerm, visibleAccounts]);
  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACCOUNTS_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedAccounts = useMemo(() => {
    const start = (safeCurrentPage - 1) * ACCOUNTS_PAGE_SIZE;
    return filteredAccounts.slice(start, start + ACCOUNTS_PAGE_SIZE);
  }, [filteredAccounts, safeCurrentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  async function loadAccounts() {
    try {
      setLoading(true);
      const [staff, customers] = await Promise.all([
        getUsersForStaff({ roleId: STAFF_ROLE_ID, limit: 200 }),
        getUsersForStaff({ roleId: CUSTOMER_ROLE_ID, limit: 500 }),
      ]);
      setStaffAccounts(staff);
      setCustomerAccounts(customers);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được tài khoản.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function handleCreateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const username = form.username.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const password = form.password.trim();

    if (!fullName || !username || !email || !password) {
      toast.error("Vui lòng nhập đủ họ tên, tài khoản, email và mật khẩu.");
      return;
    }
    if (password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    try {
      setCreating(true);
      await createUserAccount({
        full_name: fullName,
        username,
        email,
        phone,
        password,
        role_id: STAFF_ROLE_ID,
        status: ACTIVE_STATUS,
        total_points: 0,
      });
      setForm(emptyStaffForm);
      toast.success("Đã tạo tài khoản nhân viên.");
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tạo được tài khoản.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(user: ApiUser) {
    const nextStatus = user.status === LOCKED_STATUS ? ACTIVE_STATUS : LOCKED_STATUS;
    try {
      setUpdatingId(user.id);
      await updateUserAccount(user.id, { status: nextStatus });
      toast.success(nextStatus === LOCKED_STATUS ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.");
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không cập nhật được trạng thái.");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-teal-900">Quản lý tài khoản</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tạo tài khoản nhân viên và khóa tài khoản nhân viên hoặc khách hàng.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAccounts()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ReloadOutlined />
          Làm mới
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("staff")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            activeTab === "staff"
              ? "bg-teal-700 text-white"
              : "border border-gray-200 bg-white text-gray-700 hover:border-teal-600 hover:text-teal-700"
          }`}
        >
          <TeamOutlined />
          Nhân viên
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("customers")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            activeTab === "customers"
              ? "bg-teal-700 text-white"
              : "border border-gray-200 bg-white text-gray-700 hover:border-teal-600 hover:text-teal-700"
          }`}
        >
          <UserOutlined />
          Khách hàng
        </button>
      </div>

      {activeTab === "staff" ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-lg font-bold text-teal-900">
            <PlusOutlined />
            Tạo tài khoản nhân viên
          </div>
          <form onSubmit={(event) => void handleCreateStaff(event)} className="grid gap-4 lg:grid-cols-5">
            <input
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              placeholder="Họ tên"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <input
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="Tên đăng nhập"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Số điện thoại"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Mật khẩu"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <div className="lg:col-span-5">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PlusOutlined />
                Tạo nhân viên
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              {activeCount} hoạt động
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700">
              {lockedCount} đã khóa
            </span>
          </div>
          <label className="relative block w-full lg:w-80">
            <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo tên, email, SĐT..."
              className="w-full rounded-xl border border-gray-300 py-2 pl-10 pr-4 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-gray-500">Đang tải tài khoản...</div>
        ) : filteredAccounts.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">Không có tài khoản phù hợp.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Tài khoản</th>
                  <th className="px-4 py-3">Liên hệ</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedAccounts.map((user) => (
                  <tr key={user.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="font-bold text-gray-900">{accountName(user)}</div>
                      <div className="mt-1 text-xs text-gray-500">@{user.username || "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      <div>{user.email || "-"}</div>
                      <div className="mt-1 text-xs text-gray-500">{user.phone || "-"}</div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-gray-700">
                      {user.role_id === STAFF_ROLE_ID ? "Nhân viên" : "Khách hàng"}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(user.status)}`}>
                        {statusLabel(user.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(user)}
                        disabled={updatingId === user.id}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          user.status === LOCKED_STATUS
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        }`}
                      >
                        {user.status === LOCKED_STATUS ? <UnlockOutlined /> : <LockOutlined />}
                        {user.status === LOCKED_STATUS ? "Mở khóa" : "Khóa"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {filteredAccounts.length > ACCOUNTS_PAGE_SIZE ? (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
          <span>
            Hiển thị{" "}
            <b>{(safeCurrentPage - 1) * ACCOUNTS_PAGE_SIZE + 1}</b>-
            <b>{Math.min(safeCurrentPage * ACCOUNTS_PAGE_SIZE, filteredAccounts.length)}</b>{" "}
            / <b>{filteredAccounts.length}</b> tài khoản
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 font-semibold text-gray-600 transition hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Trước
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`h-9 min-w-9 rounded-lg border px-3 text-sm font-bold transition ${
                  page === safeCurrentPage
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-teal-600 hover:text-teal-700"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 font-semibold text-gray-600 transition hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sau
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

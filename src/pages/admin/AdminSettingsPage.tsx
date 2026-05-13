import { useEffect, useState, type ChangeEvent } from "react";
import { CameraOutlined, SaveOutlined } from "@ant-design/icons";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { setAvatarSrc, setUser } from "../../features/session/sessionSlice";
import axiosClient from "../../services/axiosClient";
import { normalizeUser } from "../../utils/apiMappers";
import { unwrapResult } from "../../utils/apiResponse";

function AdminAvatar({
  name,
  imageUrl,
  size = "lg",
}: {
  name?: string;
  imageUrl?: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = String(name || "AD")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const sizeClass =
    size === "lg"
      ? "h-24 w-24 text-2xl"
      : size === "sm"
        ? "h-10 w-10 text-xs"
        : "h-12 w-12 text-sm";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border-4 border-teal-50 bg-white shadow-sm ${sizeClass}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name || "Admin"}
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-teal-50 font-black text-teal-700">
          {initials || "AD"}
        </div>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.session.userId);
  const sessionUser = useAppSelector((state) => state.session.user);
  const displayName = useAppSelector((state) => state.session.displayName);
  const adminAvatarSrc = useAppSelector((state) => state.session.avatarSrc);

  const [profileDraft, setProfileDraft] = useState({
    fullName: displayName || "",
    username: sessionUser?.username || "",
    email: sessionUser?.email || "",
    phone: sessionUser?.phone || "",
    avatarUrl: adminAvatarSrc || "",
  });

  const [passwordDraft, setPasswordDraft] = useState({
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    setProfileDraft({
      fullName: displayName || sessionUser?.full_name || "",
      username: sessionUser?.username || "",
      email: sessionUser?.email || "",
      phone: sessionUser?.phone || "",
      avatarUrl: adminAvatarSrc || "",
    });
  }, [displayName, sessionUser, adminAvatarSrc]);

  async function updateAdminAccount(payload: Record<string, unknown>) {
    if (!userId) throw new Error("Không xác định được tài khoản quản trị.");
    const response = await axiosClient.patch(
      `/users/${encodeURIComponent(userId)}`,
      payload,
    );
    return normalizeUser(unwrapResult(response));
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh hợp lệ.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;

      setProfileDraft((current) => ({
        ...current,
        avatarUrl: dataUrl,
      }));

      if (userId) {
        localStorage.setItem(`bookstore_profile_avatar:${userId}`, dataUrl);
      }
      dispatch(setAvatarSrc(dataUrl));
      toast.success("Đã cập nhật ảnh đại diện.");
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveAvatar() {
    setProfileDraft((current) => ({
      ...current,
      avatarUrl: "",
    }));

    if (userId) {
      localStorage.removeItem(`bookstore_profile_avatar:${userId}`);
    }
    dispatch(setAvatarSrc(""));
    toast.success("Đã xoá ảnh đại diện.");
  }

  async function handleSaveProfile() {
    const fullName = profileDraft.fullName.trim();
    const username = profileDraft.username.trim();
    const email = profileDraft.email.trim();
    const phone = profileDraft.phone.trim();
    const avatarUrl = profileDraft.avatarUrl.trim();

    if (!fullName || !username || !email) {
      toast.error("Vui lòng nhập đủ họ tên, tài khoản và email.");
      return;
    }

    try {
      const updatedUser = await updateAdminAccount({
        full_name: fullName,
        username,
        email,
        phone,
      });

      localStorage.setItem(`bookstore_profile_avatar:${userId}`, avatarUrl);
      dispatch(setAvatarSrc(avatarUrl));
      dispatch(
        setUser({
          id: updatedUser.id || userId,
          username: updatedUser.username || username,
          email: updatedUser.email || email,
          full_name: updatedUser.full_name || fullName,
          phone: updatedUser.phone || phone,
        }),
      );
      toast.success("Đã lưu thông tin hồ sơ.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không cập nhật được thông tin hồ sơ.",
      );
    }
  }

  async function handleChangePassword() {
    const password = passwordDraft.password.trim();
    const confirmPassword = passwordDraft.confirmPassword.trim();

    if (password.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận chưa trùng khớp.");
      return;
    }

    try {
      await updateAdminAccount({ password });
      setPasswordDraft({ password: "", confirmPassword: "" });
      toast.success("Đã đổi mật khẩu thành công.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không đổi được mật khẩu.",
      );
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto md:mx-0">
      <div>
        <h1 className="text-2xl font-bold text-teal-900">Cài đặt tài khoản</h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý thông tin hồ sơ và bảo mật của quản trị viên
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-teal-900 mb-5">Hồ sơ & ảnh đại diện</h2>
        
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex flex-col items-center gap-4 shrink-0">
            <AdminAvatar
              name={profileDraft.fullName || displayName || "Admin"}
              imageUrl={profileDraft.avatarUrl}
              size="lg"
            />
            
            <div className="flex flex-col items-center gap-2">
              <label
                htmlFor="admin-avatar-upload"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-100"
              >
                <CameraOutlined />
                Đổi ảnh
              </label>
              <input
                id="admin-avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              {profileDraft.avatarUrl ? (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="text-xs text-red-500 hover:underline"
                >
                  Xoá ảnh hiện tại
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Họ và tên</span>
              <input
                value={profileDraft.fullName}
                onChange={(e) =>
                  setProfileDraft((curr) => ({ ...curr, fullName: e.target.value }))
                }
                className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm px-4 py-2 border outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Tên tài khoản (Username)</span>
              <input
                value={profileDraft.username}
                onChange={(e) =>
                  setProfileDraft((curr) => ({ ...curr, username: e.target.value }))
                }
                className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm px-4 py-2 border outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Email</span>
              <input
                value={profileDraft.email}
                onChange={(e) =>
                  setProfileDraft((curr) => ({ ...curr, email: e.target.value }))
                }
                className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm px-4 py-2 border outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Số điện thoại</span>
              <input
                value={profileDraft.phone}
                onChange={(e) =>
                  setProfileDraft((curr) => ({ ...curr, phone: e.target.value }))
                }
                className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm px-4 py-2 border outline-none"
              />
            </label>

            <div className="sm:col-span-2 flex justify-end mt-2">
              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                <SaveOutlined />
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-teal-900 mb-5">Đổi mật khẩu</h2>
        
        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Mật khẩu mới</span>
            <input
              type="password"
              value={passwordDraft.password}
              onChange={(e) =>
                setPasswordDraft((curr) => ({ ...curr, password: e.target.value }))
              }
              className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm px-4 py-2 border outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Xác nhận mật khẩu</span>
            <input
              type="password"
              value={passwordDraft.confirmPassword}
              onChange={(e) =>
                setPasswordDraft((curr) => ({
                  ...curr,
                  confirmPassword: e.target.value,
                }))
              }
              className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm px-4 py-2 border outline-none"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => void handleChangePassword()}
              disabled={!passwordDraft.password || !passwordDraft.confirmPassword}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cập nhật mật khẩu
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

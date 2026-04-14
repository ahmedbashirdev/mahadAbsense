import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/logger";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import Link from "next/link";

export const dynamic = 'force-dynamic';

async function addUser(formData: FormData) {
  "use server"
  const session = await getSession();
  if (session?.role !== 'ADMIN') return;

  const name = formData.get("name") as string;
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;

  if (!name || !username || !password) return;

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: { name, username, password: hashedPassword, role }
    });
    await logActivity("إضافة حساب", `إنشاء حساب جديد (${username}) بصلاحية ${role}`);
  } catch (e) {
    // Usually unique constraint failed
  }
  revalidatePath("/users");
}

async function updateUser(formData: FormData) {
  "use server"
  const session = await getSession();
  if (session?.role !== 'ADMIN') return;

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;

  if (!id || !name || !username) return;

  const updateData: any = { name, username, role };
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }

  try {
    await prisma.user.update({
      where: { id },
      data: updateData
    });
    await logActivity("تعديل حساب", `تعديل حساب (${username})`);
  } catch (e) {
    // Usually unique constraint failed
  }
  revalidatePath("/users");
  redirect("/users");
}

async function deleteUser(formData: FormData) {
  "use server"
  const session = await getSession();
  if (session?.role !== 'ADMIN') return;

  const id = formData.get("id") as string;
  if (!id || id === session.userId) return; // Prevent deleting oneself
  
  const userToDelete = await prisma.user.findUnique({ where: { id } });
  if (userToDelete) {
    await prisma.user.delete({ where: { id } });
    await logActivity("حذف حساب", `حذف حساب (${userToDelete.username})`);
  }
  revalidatePath("/users");
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const session = await getSession();
  if (session?.role !== 'ADMIN') {
    redirect("/"); // Block non-admins
  }

  const sp = await searchParams;
  const editId = sp.edit;
  let userToEdit: any = null;
  if (editId) {
    userToEdit = await prisma.user.findUnique({ where: { id: editId } });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">إدارة المستخدمين</h1>
          <p className="page-subtitle">إنشاء وإدارة حسابات النظام الإدارية والصلاحيات</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
        <section className="card animate-fade-in" style={{ height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>
             {userToEdit ? "تعديل حساب" : "إنشاء حساب جديد"}
          </h3>
          {userToEdit ? (
            <form action={updateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="hidden" name="id" value={userToEdit.id} />
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم الموظف</label>
                <input type="text" name="name" className="input-field" defaultValue={userToEdit.name} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم الدخول (Username)</label>
                <input type="text" name="username" className="input-field" defaultValue={userToEdit.username} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>كلمة المرور الجديدة (اختياري)</label>
                <input type="password" name="password" className="input-field" placeholder="اتركه فارغاً لعدم التغيير" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>الصلاحية</label>
                <select name="role" className="input-field" defaultValue={userToEdit.role} required>
                  <option value="STAFF">مسؤول غياب (STAFF)</option>
                  <option value="ADMIN">مدير نظام (ADMIN)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>حفظ التعديلات</button>
                <Link href="/users" className="btn btn-danger" style={{ flex: 1, textAlign: 'center', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>إلغاء</Link>
              </div>
            </form>
          ) : (
            <form action={addUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم الموظف</label>
                <input type="text" name="name" className="input-field" required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم الدخول (Username)</label>
                <input type="text" name="username" className="input-field" required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>كلمة المرور الابتدائية</label>
                <input type="password" name="password" className="input-field" required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>الصلاحية</label>
                <select name="role" className="input-field" required>
                  <option value="STAFF">مسؤول غياب (STAFF)</option>
                  <option value="ADMIN">مدير نظام (ADMIN)</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                إنشاء الحساب
              </button>
            </form>
          )}
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>الحسابات المسجلة</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>اسم الدخول</th>
                  <th>الدور</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td>{u.username}</td>
                    <td>
                       <span className="status-badge" style={{ backgroundColor: u.role === 'ADMIN' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)', color: u.role === 'ADMIN' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                           {u.role === 'ADMIN' ? 'مدير' : 'موظف'}
                       </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Link href={`/users?edit=${u.id}`} className="btn" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                          تعديل
                        </Link>
                        {u.id !== session.userId && (
                          <SubmitWithConfirm action={deleteUser} id={u.id} confirmMessage={`هل أنت متأكد من حذف حساب ${u.username}؟`} />
                        )}
                        {u.id === session.userId && <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>أنت</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

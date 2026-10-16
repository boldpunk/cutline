import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-20">
      <h1 className="display text-6xl">Не найдено</h1>
      <p className="mt-4 text-muted-text">Страница не существует или ссылка недействительна.</p>
      <Link href="/" className="btn btn-dark mt-8">
        На главную
      </Link>
    </main>
  );
}

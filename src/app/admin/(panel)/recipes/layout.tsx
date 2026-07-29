import "@/components/admin/recipe-book/recipe-book-print.css";

export default function RecipeBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="recipe-book-layout">{children}</div>;
}

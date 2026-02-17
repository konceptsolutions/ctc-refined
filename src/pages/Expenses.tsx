import { Sidebar } from "@/components/dashboard/Sidebar";
import { ExpenseManagement } from "@/components/expenses/ExpenseManagement";

const Expenses = () => {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-16 p-6 overflow-auto">
        <ExpenseManagement />
      </main>
    </div>
  );
};

export default Expenses;

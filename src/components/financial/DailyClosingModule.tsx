import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentDatePakistan } from "@/utils/dateUtils";
import { DailyClosingTab } from "./DailyClosingTab";
import { DailyActivityTab } from "./DailyActivityTab";

export const DailyClosingModule = () => {
  const [pageView, setPageView] = useState<"closing" | "activity">("closing");
  const [selectedDate, setSelectedDate] = useState(getCurrentDatePakistan());

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          value={pageView}
          onValueChange={(v) => setPageView(v as "closing" | "activity")}
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="closing">Daily Closing</TabsTrigger>
            <TabsTrigger value="activity">Daily Activity</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card className="sm:border-0 sm:shadow-none sm:bg-transparent">
          <CardContent className="p-0 sm:pt-0">
            <div className="space-y-2">
              <Label htmlFor="daily-module-date">Date</Label>
              <Input
                id="daily-module-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-44"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {pageView === "closing" ? (
        <DailyClosingTab date={selectedDate} hideDatePicker />
      ) : (
        <DailyActivityTab date={selectedDate} hideDatePicker />
      )}
    </div>
  );
};

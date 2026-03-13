"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { runPipeline } from "@/lib/api";
import { Globe, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ImportPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      if (activeTab === "url" && url) {
        formData.append("url", url);
      } else if (activeTab === "csv" && file) {
        formData.append("file", file);
        if (productName) formData.append("product_name", productName);
      }

      const result = await runPipeline(formData);
      
      // Save to recent analyses
      const recent = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
      recent.unshift({
        id: result.project_id,
        product_name: productName || null,
        review_count: 0,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem("recent_analyses", JSON.stringify(recent.slice(0, 10)));

      setSuccess(true);
      setTimeout(() => {
        router.push(`/summary?projectId=${result.project_id}`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import reviews");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Import Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import reviews from Trustpilot or upload a CSV file for analysis
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Data Source</CardTitle>
            <CardDescription>
              Choose how you want to import your review data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="url" className="gap-2">
                  <Globe className="h-4 w-4" />
                  Trustpilot URL
                </TabsTrigger>
                <TabsTrigger value="csv" className="gap-2">
                  <Upload className="h-4 w-4" />
                  CSV Upload
                </TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit}>
                <TabsContent value="url" className="space-y-4">
                  <div>
                    <label htmlFor="url" className="block text-sm font-medium text-foreground mb-2">
                      Trustpilot URL
                    </label>
                    <input
                      id="url"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.trustpilot.com/review/example.com"
                      className="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      required={activeTab === "url"}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Example: https://www.trustpilot.com/review/airbnb.com
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="csv" className="space-y-4">
                  <div>
                    <label htmlFor="file" className="block text-sm font-medium text-foreground mb-2">
                      CSV File
                    </label>
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                      <input
                        id="file"
                        type="file"
                        accept=".csv"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <label htmlFor="file" className="cursor-pointer">
                        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-foreground font-medium">
                          {file ? file.name : "Click to upload or drag and drop"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          CSV with columns: body, rating, date (optional)
                        </p>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="productName" className="block text-sm font-medium text-foreground mb-2">
                      Product Name (optional)
                    </label>
                    <input
                      id="productName"
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Enter product or company name"
                      className="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </TabsContent>

                {error && (
                  <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive mt-4">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 p-4 rounded-lg bg-success/10 text-success mt-4">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm">Reviews imported successfully! Redirecting...</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full mt-6"
                  disabled={isLoading || success || (activeTab === "url" ? !url : !file)}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Importing...
                    </>
                  ) : (
                    "Analyze Reviews"
                  )}
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-foreground mb-2">Trustpilot Scraping</h3>
              <p className="text-xs text-muted-foreground">
                Automatically extracts reviews from any Trustpilot company page. 
                We scrape up to 100 reviews per request.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-foreground mb-2">CSV Format</h3>
              <p className="text-xs text-muted-foreground">
                Upload a CSV with at minimum a "body" or "text" column. 
                Optional columns: rating, date, author, title.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

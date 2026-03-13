"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { runPipeline } from "@/lib/api";
import { Globe, Upload, Loader2, CheckCircle2, AlertCircle, ArrowRight, FileText, Zap } from "lucide-react";

export default function ImportPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"url" | "csv">("url");
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
      
      // Only save if reviews were actually imported
      if (!result.reviewCount || result.reviewCount === 0) {
        setError("No reviews were imported. The URL may not exist or have no reviews. Please try a different URL.");
        return;
      }
      
      const recent = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
      recent.unshift({
        id: result.project_id,
        product_name: result.productName || productName || url.split("/").pop() || "Untitled",
        review_count: result.reviewCount,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem("recent_analyses", JSON.stringify(recent.slice(0, 10)));

      setSuccess(true);
      setTimeout(() => {
        router.push(`/summary?projectId=${result.project_id}`);
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import reviews";
      // Improve error messages
      if (message.includes("404")) {
        setError("Review page not found. Please check the URL and try again.");
      } else if (message.includes("timeout") || message.includes("timed out")) {
        setError("Import took too long. Please try again with a smaller URL or CSV file.");
      } else if (message.includes("Failed to fetch")) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Navigation />
      
      <div className="absolute inset-x-0 top-16 h-[400px] gradient-bg pointer-events-none" />
      
      <main className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-[hsl(var(--primary))] mb-2">Import</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Import your reviews
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-3 max-w-md mx-auto">
            Scrape reviews from Trustpilot or upload a CSV file to get AI-powered insights
          </p>
        </div>

        {/* Import Card */}
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          {/* Tab Buttons */}
          <div className="flex border-b border-[hsl(var(--border))]">
            <button
              onClick={() => setActiveTab("url")}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-all ${
                activeTab === "url"
                  ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-b-2 border-[hsl(var(--primary))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary)/0.5)]"
              }`}
            >
              <Globe className="h-4 w-4" />
              Trustpilot URL
            </button>
            <button
              onClick={() => setActiveTab("csv")}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-all ${
                activeTab === "csv"
                  ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-b-2 border-[hsl(var(--primary))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary)/0.5)]"
              }`}
            >
              <Upload className="h-4 w-4" />
              Upload CSV
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8">
            {activeTab === "url" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="url" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                    Trustpilot Review Page URL
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                    <input
                      id="url"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.trustpilot.com/review/company.com"
                      className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent transition-all"
                      required={activeTab === "url"}
                    />
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    We&apos;ll scrape up to 100 reviews automatically
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label htmlFor="file" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                    Upload CSV File
                  </label>
                  <label
                    htmlFor="file"
                    className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                      file
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--secondary)/0.5)]"
                    }`}
                  >
                    <input
                      id="file"
                      type="file"
                      accept=".csv"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {file ? (
                      <>
                        <FileText className="h-10 w-10 text-[hsl(var(--primary))] mb-3" />
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">{file.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Click to change file</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 text-[hsl(var(--muted-foreground))] mb-3" />
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                          Drop your CSV here or click to browse
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          Required column: body or text
                        </p>
                      </>
                    )}
                  </label>
                </div>

                <div>
                  <label htmlFor="productName" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                    Product/Company Name <span className="text-[hsl(var(--muted-foreground))]">(optional)</span>
                  </label>
                  <input
                    id="productName"
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g., Acme Inc"
                    className="w-full px-4 py-3.5 rounded-xl bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            {/* Status Messages */}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[hsl(var(--negative)/0.1)] border border-[hsl(var(--negative)/0.2)] mt-6">
                <AlertCircle className="h-5 w-5 text-[hsl(var(--negative))] flex-shrink-0" />
                <p className="text-sm text-[hsl(var(--negative))]">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[hsl(var(--positive)/0.1)] border border-[hsl(var(--positive)/0.2)] mt-6">
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--positive))] flex-shrink-0" />
                <p className="text-sm text-[hsl(var(--positive))]">
                  Reviews imported successfully! Redirecting to insights...
                </p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full mt-6 h-12 text-base glow-sm"
              disabled={isLoading || success || (activeTab === "url" ? !url : !file)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Analyzing reviews...
                </>
              ) : (
                <>
                  Start Analysis
                  <ArrowRight className="h-5 w-5 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Feature Cards */}
        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center">
                <Globe className="h-5 w-5 text-[hsl(var(--primary))]" />
              </div>
              <h3 className="font-semibold text-[hsl(var(--foreground))]">Trustpilot Scraping</h3>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              Automatically extracts reviews from any Trustpilot page including ratings, dates, and author information.
            </p>
          </div>
          
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[hsl(var(--info)/0.1)] flex items-center justify-center">
                <FileText className="h-5 w-5 text-[hsl(var(--info))]" />
              </div>
              <h3 className="font-semibold text-[hsl(var(--foreground))]">CSV Format</h3>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              Upload any CSV with a &quot;body&quot; or &quot;text&quot; column. Optional: rating, date, author, title columns.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

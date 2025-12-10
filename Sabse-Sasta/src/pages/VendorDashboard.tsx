import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { vendorsAPI } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileSpreadsheet, LogOut, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Product {
  product_id: string;
  product_name: string;
  brand: string;
  price: string;
  stock_quantity: number;
  is_available: boolean;
}

const VendorDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'vendor') {
      navigate("/vendor-login");
      return;
    }
    setVendorName(user.name || user.email || "Vendor");
    checkApprovalStatus();
    fetchProducts();
  }, [isAuthenticated, user, navigate]);

  const checkApprovalStatus = async () => {
    try {
      const status = await vendorsAPI.getStatus();
      setIsApproved(status.approved);
      
      if (!status.approved) {
        // Redirect to pending approval page
        navigate("/vendor-pending-approval");
      }
    } catch (error: any) {
      console.error("Error checking approval status:", error);
      toast({
        title: "Error",
        description: "Failed to check vendor approval status",
        variant: "destructive",
      });
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const data = await vendorsAPI.getVendorProducts();
      setProducts(data || []);
    } catch (error: any) {
      console.error("Error fetching products:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load products",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv"
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel (.xlsx, .xls) or CSV file",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      if (!isAuthenticated || !user) {
        throw new Error("Not authenticated");
      }

      await vendorsAPI.uploadFile(file);

      toast({
        title: "Upload successful",
        description: "Your products have been imported successfully",
      });

      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/vendor-login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Vendor Dashboard</h1>
            <p className="text-muted-foreground">Welcome, {vendorName}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="grid gap-6 mb-8">
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Product Catalog
              </CardTitle>
              <CardDescription>
                Upload your product catalog as an Excel or CSV file
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <Label
                    htmlFor="file-upload"
                    className="cursor-pointer inline-block"
                  >
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Excel (.xlsx, .xls) or CSV files
                      </p>
                    </div>
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  {uploading && (
                    <div className="mt-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">
                        Uploading...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                My Products
              </CardTitle>
              <CardDescription>
                View and manage your product catalog ({products.length} products)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                </div>
              ) : products.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No products yet. Upload your first product catalog above.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {products.slice(0, 20).map((product) => (
                    <div
                      key={product.product_id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Package className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{product.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {product.brand || 'No brand'} • Stock: {product.stock_quantity}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-primary">Rs. {parseFloat(product.price).toFixed(2)}</p>
                        <Badge
                          variant={product.is_available ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {product.is_available ? "Available" : "Unavailable"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {products.length > 20 && (
                    <p className="text-center text-sm text-muted-foreground pt-2">
                      Showing 20 of {products.length} products
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VendorDashboard;

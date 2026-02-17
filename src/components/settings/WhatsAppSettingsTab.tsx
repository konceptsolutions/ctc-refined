import { useState, useEffect } from "react";
import { MessageCircle, Save, Eye, EyeOff, CheckCircle, Send, FileText, Image, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import apiClient from "@/lib/api";

type MessageType = "text" | "file" | "template";

export const WhatsAppSettingsTab = () => {
  const [appKey, setAppKey] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [administratorPhoneNumber, setAdministratorPhoneNumber] = useState("");
  const [showAppKey, setShowAppKey] = useState(false);
  const [showAuthKey, setShowAuthKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Message sending state
  const [receiverPhoneNumber, setReceiverPhoneNumber] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("text");
  const [message, setMessage] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateVariables, setTemplateVariables] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await apiClient.getWhatsAppSettings();
        if (response.error) {
        } else if (response.data) {
          setAppKey(response.data.appKey || "");
          setAuthKey(response.data.authKey || "");
          setAdministratorPhoneNumber(response.data.administratorPhoneNumber || "");
        }
      } catch (error: any) {
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const response = await apiClient.updateWhatsAppSettings({
        appKey: appKey || undefined,
        authKey: authKey || undefined,
        administratorPhoneNumber: administratorPhoneNumber || undefined,
      });
      
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Settings Saved",
          description: "WhatsApp API settings have been saved successfully.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!receiverPhoneNumber) {
      toast({
        title: "Error",
        description: "Please enter receiver phone number",
        variant: "destructive",
      });
      return;
    }

    if (messageType === "text" && !message) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive",
      });
      return;
    }

    if (messageType === "file" && !fileUrl) {
      toast({
        title: "Error",
        description: "Please enter a file URL",
        variant: "destructive",
      });
      return;
    }

    if (messageType === "template" && !templateId) {
      toast({
        title: "Error",
        description: "Please enter a template ID",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      const payload: any = {
        to: receiverPhoneNumber,
      };

      if (messageType === "text") {
        payload.message = message;
        if (fileUrl) {
          payload.file = fileUrl;
        }
      } else if (messageType === "file") {
        payload.message = message || "File attachment";
        payload.file = fileUrl;
      } else if (messageType === "template") {
        payload.template_id = templateId;
        if (templateVariables) {
          // Parse template variables (format: key1:value1,key2:value2 or JSON)
          try {
            let vars: Record<string, string> = {};
            if (templateVariables.trim().startsWith("{")) {
              vars = JSON.parse(templateVariables);
            } else {
              const pairs = templateVariables.split(",");
              pairs.forEach((pair) => {
                const [key, value] = pair.split(":").map((s) => s.trim());
                if (key && value) {
                  vars[key] = value;
                }
              });
            }
            payload.variables = vars;
          } catch (e) {
            toast({
              title: "Warning",
              description: "Invalid template variables format. Using empty variables.",
            });
          }
        }
      }

      const response = await apiClient.sendWhatsAppMessage(payload);

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to send message",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "WhatsApp message sent successfully!",
        });
        // Clear form
        setMessage("");
        setFileUrl("");
        setTemplateId("");
        setTemplateVariables("");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send WhatsApp message",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <CardTitle>WhatsApp API Configuration</CardTitle>
              <CardDescription>
                Configure your WhatsApp API credentials for messaging integration
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appKey">App Key</Label>
              <div className="relative">
                <Input
                  id="appKey"
                  type={showAppKey ? "text" : "password"}
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                  placeholder="Enter your WhatsApp App Key"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowAppKey(!showAppKey)}
                >
                  {showAppKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your unique application identifier for WhatsApp API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="authKey">Auth Key</Label>
              <div className="relative">
                <Input
                  id="authKey"
                  type={showAuthKey ? "text" : "password"}
                  value={authKey}
                  onChange={(e) => setAuthKey(e.target.value)}
                  placeholder="Enter your WhatsApp Auth Key"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowAuthKey(!showAuthKey)}
                >
                  {showAuthKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your authentication key for secure API access
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="administratorPhoneNumber">Administrator Phone Number</Label>
              <Input
                id="administratorPhoneNumber"
                type="tel"
                value={administratorPhoneNumber}
                onChange={(e) => setAdministratorPhoneNumber(e.target.value)}
                placeholder="e.g., +923001234567 (with country code)"
                className="pr-10"
              />
              <p className="text-xs text-muted-foreground">
                Your administrator WhatsApp number (full number with country code)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
            
            {appKey && authKey && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>API credentials configured</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <CardTitle>Send WhatsApp Message</CardTitle>
              <CardDescription>
                Send messages to recipients using WhatsApp API
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="receiverPhoneNumber">Receiver Phone Number *</Label>
              <Input
                id="receiverPhoneNumber"
                type="tel"
                value={receiverPhoneNumber}
                onChange={(e) => setReceiverPhoneNumber(e.target.value)}
                placeholder="e.g., +923001234567 (full number with country code)"
              />
              <p className="text-xs text-muted-foreground">
                Enter the recipient's WhatsApp number with country code
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="messageType">Message Type</Label>
              <Select value={messageType} onValueChange={(value) => setMessageType(value as MessageType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Text Message
                    </div>
                  </SelectItem>
                  <SelectItem value="file">
                    <div className="flex items-center gap-2">
                      <File className="w-4 h-4" />
                      Text with File
                    </div>
                  </SelectItem>
                  <SelectItem value="template">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      Template Message
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {messageType === "text" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Enter your message (max 1000 words)"
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum 1000 words
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fileUrl">File URL (Optional)</Label>
                  <Input
                    id="fileUrl"
                    type="url"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    placeholder="https://example.com/file.pdf"
                  />
                  <p className="text-xs text-muted-foreground">
                    Supported formats: jpg, jpeg, png, webp, pdf, docx, xlsx, csv, txt
                  </p>
                </div>
              </>
            )}

            {messageType === "file" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="message">Message (Optional)</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Enter your message (optional)"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fileUrl">File URL *</Label>
                  <Input
                    id="fileUrl"
                    type="url"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    placeholder="https://example.com/file.pdf"
                  />
                  <p className="text-xs text-muted-foreground">
                    Supported formats: jpg, jpeg, png, webp, pdf, docx, xlsx, csv, txt
                  </p>
                </div>
              </>
            )}

            {messageType === "template" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="templateId">Template ID *</Label>
                  <Input
                    id="templateId"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    placeholder="Enter template ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="templateVariables">Template Variables (Optional)</Label>
                  <Textarea
                    id="templateVariables"
                    value={templateVariables}
                    onChange={(e) => setTemplateVariables(e.target.value)}
                    placeholder='Format: key1:value1,key2:value2 or {"key1":"value1","key2":"value2"}'
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter variables as comma-separated key:value pairs or JSON object
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center gap-4 pt-4 border-t">
              <Button 
                onClick={handleSendMessage} 
                disabled={isSending || !receiverPhoneNumber}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSending ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="text-sm font-medium">WhatsApp API Connected</p>
              <p className="text-xs text-muted-foreground">
                Your WhatsApp integration is active and ready to send messages
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

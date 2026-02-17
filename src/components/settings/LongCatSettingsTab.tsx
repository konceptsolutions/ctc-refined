import { useState, useEffect } from "react";
import { Bot, Save, Eye, EyeOff, CheckCircle, Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import apiClient from "@/lib/api";

export const LongCatSettingsTab = () => {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("LongCat-Flash-Chat");
  const [baseUrl, setBaseUrl] = useState("https://api.longcat.chat");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Chat testing state
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [useAnthropicFormat, setUseAnthropicFormat] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await apiClient.getLongCatSettings();
        if (response.error) {
        } else if (response.data) {
          // Pre-fill with provided API key if not already set
          setApiKey(response.data.apiKey || "ak_2No6Dx1vk4Di5so3aB53O3gd0B61t");
          setModel(response.data.model || "LongCat-Flash-Chat");
          setBaseUrl(response.data.baseUrl || "https://api.longcat.chat");
        } else {
          // If no settings exist, pre-fill with default API key
          setApiKey("ak_2No6Dx1vk4Di5so3aB53O3gd0B61t");
        }
      } catch (error: any) {
        // Pre-fill with default API key on error
        setApiKey("ak_2No6Dx1vk4Di5so3aB53O3gd0B61t");
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const response = await apiClient.updateLongCatSettings({
        apiKey: apiKey || undefined,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
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
          description: "LongCat API settings have been saved successfully.",
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

  const handleTestChat = async () => {
    if (!testMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter a test message",
        variant: "destructive",
      });
      return;
    }

    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please configure API key first",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    setTestResponse("");

    try {
      const messages = [
        {
          role: "user",
          content: testMessage,
        },
      ];

      let response;
      if (useAnthropicFormat) {
        response = await apiClient.sendLongCatMessage({
          messages,
          model,
          max_tokens: 500,
          temperature: 0.7,
        });
      } else {
        response = await apiClient.sendLongCatChat({
          messages,
          model,
          max_tokens: 500,
          temperature: 0.7,
        });
      }

      if (response.error) {
        setTestResponse(`Error: ${response.error}`);
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
      } else if (response.data) {
        // Handle OpenAI format response
        if (response.data.choices && response.data.choices[0]) {
          setTestResponse(response.data.choices[0].message?.content || "No response content");
        }
        // Handle Anthropic format response
        else if (response.data.content && Array.isArray(response.data.content)) {
          const textContent = response.data.content.find((c: any) => c.type === "text");
          setTestResponse(textContent?.text || "No response content");
        } else {
          setTestResponse(JSON.stringify(response.data, null, 2));
        }
        toast({
          title: "Success",
          description: "Chat test completed successfully.",
        });
      }
    } catch (error: any) {
      setTestResponse(`Error: ${error.message || "Failed to send test message"}`);
      toast({
        title: "Error",
        description: error.message || "Failed to send test message",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            LongCat API Configuration
          </CardTitle>
          <CardDescription>
            Configure your LongCat API settings. The API key will be securely stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your LongCat API key"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Your API key: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">ak_2No6Dx1vk4Di5so3aB53O3gd0B61t</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LongCat-Flash-Chat">LongCat-Flash-Chat</SelectItem>
                <SelectItem value="LongCat-Flash-Thinking">LongCat-Flash-Thinking</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500">
              Select the LongCat model to use for chat completions.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.longcat.chat"
            />
            <p className="text-sm text-gray-500">
              The base URL for the LongCat API endpoint.
            </p>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? (
              <>
                <span className="mr-2">Saving...</span>
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>

          {apiKey && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>API key is configured</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Test Chat
          </CardTitle>
          <CardDescription>
            Test your LongCat API configuration by sending a test message.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="testMessage">Test Message</Label>
            <Textarea
              id="testMessage"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Enter a test message..."
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="useAnthropicFormat"
              checked={useAnthropicFormat}
              onChange={(e) => setUseAnthropicFormat(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="useAnthropicFormat" className="text-sm font-normal cursor-pointer">
              Use Anthropic API format (instead of OpenAI format)
            </Label>
          </div>

          <Button
            onClick={handleTestChat}
            disabled={isTesting || !testMessage.trim() || !apiKey}
            className="w-full"
          >
            {isTesting ? (
              <>
                <span className="mr-2">Testing...</span>
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Test Message
              </>
            )}
          </Button>

          {testResponse && (
            <div className="space-y-2">
              <Label>Response</Label>
              <div className="p-4 bg-gray-50 rounded-md border border-gray-200">
                <pre className="text-sm whitespace-pre-wrap">{testResponse}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


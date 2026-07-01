import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Loader2, Image as ImageIcon, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';

export default function CreateThreadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      
      if (file.size > 10 * 1024 * 1024) {
        sonnerToast.error('Image must be less than 10MB');
        return;
      }

      setCoverImage(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: 'Error',
        description: 'Title and content are required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      let coverImageUrl = null;

      if (coverImage) {
        const fileExt = coverImage.name.split('.').pop();
        const fileName = `threads/${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(fileName, coverImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('posts')
          .getPublicUrl(fileName);

        coverImageUrl = publicUrl;
      }

      const { error } = await supabase.from('threads').insert({
        user_id: user.id,
        title: title.trim(),
        content: content.trim(),
        cover_image: coverImageUrl,
        is_published: true,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Thread published successfully',
      });

      navigate('/threads');
    } catch (error: any) {
      console.error('Error creating thread:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create thread',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Create Thread" showBack />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div>
          <label className="block text-sm font-semibold mb-2">Cover Image (Optional)</label>
          {coverPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img src={coverPreview} alt="Cover" className="w-full max-h-96 object-cover" />
              <button
                onClick={() => {
                  setCoverImage(null);
                  setCoverPreview(null);
                }}
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
              <ImageIcon className="w-12 h-12 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Click to upload cover image</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Title</label>
          <Input
            placeholder="Give your thread a compelling title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="text-lg"
          />
          <div className="text-right text-sm text-muted-foreground mt-1">
            {title.length}/200
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Content</label>
          <Textarea
            placeholder="Share your story, thoughts, or insights... You can use hashtags to connect with related posts!"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[400px] text-base leading-relaxed"
            maxLength={10000}
          />
          <div className="text-right text-sm text-muted-foreground mt-1">
            {content.length}/10,000 characters
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => navigate('/threads')}
            variant="outline"
            className="flex-1"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePublish}
            className="flex-1"
            disabled={loading || !title.trim() || !content.trim()}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Publish Thread
          </Button>
        </div>
      </div>
    </div>
  );
}

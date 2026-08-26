import React, { useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import { FaFolderOpen, FaTrash, FaUpload, FaFilePdf, FaFileAlt } from 'react-icons/fa';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#22d3ee';

// Prensa / EPK (Electronic Press Kit). Reutiliza el modelo profile.digitalFiles,
// que ya renderiza ProfileExtraSections en el perfil público (gateado a ULTRA).
export const StagePressTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const files: any[] = Array.isArray(profileData?.digitalFiles) ? profileData.digitalFiles : [];
  const [uploading, setUploading] = useState(false);

  const persist = async (list: any[]) => {
    const { error } = await supabase.from('profiles').update({ digitalFiles: list }).eq('id', user.id);
    if (error) throw error;
    setProfileData((prev: any) => ({ ...prev, digitalFiles: list }));
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.id) return;
    const fileList = Array.from(event.target.files || []);
    if (fileList.length === 0) return;
    setUploading(true);
    try {
      const uploaded: any[] = [];
      for (const file of fileList) {
        const path = `digital_files/${user.id}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('assets').upload(path, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
        uploaded.push({
          id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: file.name,
          fileType: (file.name.split('.').pop() || 'file').toLowerCase(),
          size: file.size,
          url: publicUrl,
        });
      }
      await persist([...files, ...uploaded]);
      showNotification('Archivo(s) subido(s)', 'success');
    } catch (err: any) {
      showNotification(`Error al subir: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este archivo del EPK?')) return;
    try { await persist(files.filter(f => f.id !== id)); }
    catch (err: any) { showNotification(`Error: ${err?.message}`, 'error'); }
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-3xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <h2 className="text-2xl font-black text-white flex items-center gap-2"><FaFolderOpen style={{ color: ACCENT }} /> Prensa & EPK</h2>
        <p className="text-sm text-white/40 mt-1">Tu kit de prensa: rider técnico, bio, fotos en alta, contratos. Visible para promotores y medios.</p>
      </div>

      <label className="block cursor-pointer">
        <div className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-10 transition hover:bg-white/[0.02]" style={{ borderColor: `${ACCENT}40` }}>
          <FaUpload className="text-2xl mb-2" style={{ color: ACCENT }} />
          <p className="text-sm font-bold text-white">{uploading ? 'Subiendo…' : 'Subir archivos al EPK'}</p>
          <p className="text-[11px] text-white/40 mt-1">PDF, imágenes, documentos…</p>
        </div>
        <input type="file" multiple className="hidden" onChange={handleUpload} />
      </label>

      {files.length === 0 ? (
        <div className="text-center py-10 text-white/30"><p className="text-sm">Aún no has subido archivos a tu EPK.</p></div>
      ) : (
        <div className="space-y-2.5">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
                {(f.fileType || '').includes('pdf') ? <FaFilePdf /> : <FaFileAlt />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{f.title || 'Archivo'}</p>
                <p className="text-[11px] text-white/40 uppercase">{f.fileType}</p>
              </div>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold shrink-0" style={{ color: ACCENT }}>Ver ↗</a>
              <button onClick={() => remove(f.id)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StagePressTab;

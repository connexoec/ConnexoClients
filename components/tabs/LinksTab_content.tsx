
            {/* Sección de Video Destacado */}
            <section className="animate-fade-in delay-500">
                <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
                        <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                        </div>
                        <h3 className="font-bold text-xl text-white">Video Destacado</h3>
                    </div>

                    <div className="flex bg-[#0f1016] p-1 rounded-xl border border-gray-800 mb-8 w-fit">
                        <button
                            type="button"
                            onClick={() => setVideoInputMode('external')}
                            className={`py-2 px-6 rounded-lg text-xs font-bold transition-all ${videoInputMode === 'external' ? 'bg-gray-800 text-white shadow-lg border border-gray-700' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Enlace YouTube/Vimeo
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!isUltra) return;
                                setVideoInputMode('upload');
                            }}
                            disabled={!isUltra}
                            className={`py-2 px-6 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${videoInputMode === 'upload' ? 'bg-gray-800 text-white shadow-lg border border-gray-700' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}
                        >
                            Subir Video Propio
                            {!isUltra && <span className="bg-gray-800 text-[8px] px-1.5 py-0.5 rounded text-gray-400">ULTRA</span>}
                        </button>
                    </div>

                    {videoInputMode === 'external' && (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-3 items-end">
                                <div className="flex-grow w-full">
                                    <Input
                                        id="featuredVideoURL"
                                        name="featuredVideoURL"
                                        label="URL del Video (YouTube o Vimeo)"
                                        value={profileData.featuredVideoURL || ''}
                                        onChange={(e) => setProfileData(prev => ({ ...prev, featuredVideoURL: e.target.value }))}
                                        placeholder="Pega aquí el enlace..."
                                        className="bg-[#0f1016] border-gray-700 text-white"
                                    />
                                </div>
                                <Button 
                                    onClick={() => {
                                        if (user) {
                                            setDoc(doc(db, 'profiles', user.uid), { featuredVideoURL: profileData.featuredVideoURL }, { merge: true });
                                        }
                                    }} 
                                    className="bg-[#ff6600] hover:bg-[#ff8533] text-white py-2 px-8 h-[42px]"
                                >
                                    Guardar
                                </Button>
                            </div>
                            <p className="text-[10px] text-gray-500 italic uppercase tracking-wider">
                                El video se reproducirá directamente en tu perfil público.
                            </p>
                        </div>
                    )}

                    {videoInputMode === 'upload' && (
                        <div className="space-y-6">
                            {!isUltra ? (
                                <div className="p-8 bg-[#0f1016] border border-dashed border-gray-800 rounded-2xl text-center">
                                    <p className="text-gray-500 text-sm">Esta función requiere el <span className="text-[#ff6600] font-bold">Plan ULTRA</span>.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {profileData?.uploadedVideoURL ? (
                                        <div className="space-y-4">
                                            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                                                <video
                                                    src={profileData.uploadedVideoURL}
                                                    controls
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <button
                                                onClick={handleDeleteUploadedVideo}
                                                className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-400 transition-colors"
                                                disabled={uploadingVideo}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                Eliminar Video
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-[#0f1016] p-10 rounded-2xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center text-center group hover:border-[#ff6600]/30 transition-colors">
                                            <div className="w-16 h-16 bg-gray-800/30 rounded-full flex items-center justify-center text-gray-600 mb-4 group-hover:text-[#ff6600] transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                            </div>
                                            <p className="text-white font-bold mb-1">Subir Archivo de Video</p>
                                            <p className="text-gray-500 text-[10px] mb-6 uppercase tracking-wider">Límite: 100 MB</p>
                                            
                                            <label className={`bg-[#ff6600] hover:bg-[#ff8533] text-white font-bold py-2.5 px-8 rounded-xl shadow-lg shadow-[#ff6600]/20 cursor-pointer transition-all active:scale-95 ${uploadingVideo ? 'opacity-50 pointer-events-none' : ''}`}>
                                                {uploadingVideo ? `Subiendo ${uploadProgress}%...` : 'Seleccionar Video'}
                                                <input
                                                    type="file"
                                                    accept="video/*"
                                                    onChange={handleVideoUpload}
                                                    className="hidden"
                                                    disabled={uploadingVideo}
                                                />
                                            </label>
                                        </div>
                                    )}
                                    <div className="flex flex-col justify-center space-y-4">
                                        <h4 className="text-white font-bold">Consejos de Video</h4>
                                        <ul className="space-y-3">
                                            {[
                                                'Usa formatos MP4 o WebM para mejor compatibilidad.',
                                                'Manten el video bajo los 60 segundos para retención.',
                                                'Asegúrate de tener buena iluminación en tu presentación.'
                                            ].map((tip, i) => (
                                                <li key={i} className="flex gap-3 text-xs text-gray-400">
                                                    <span className="text-[#ff6600] font-bold">•</span>
                                                    {tip}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>

            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />

            {/* Sección de Testimonios - Solo para PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <section className="animate-fade-in delay-[600ms]">
                    <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                </div>
                                <h3 className="font-bold text-xl text-white">Testimonios y Reseñas</h3>
                            </div>
                            <Button 
                                onClick={() => openTestimonialForm()} 
                                className="bg-[#ff6600] hover:bg-[#ff8533] text-white border-none px-6 py-2 text-sm font-bold rounded-xl"
                            >
                                + Nuevo Testimonio
                            </Button>
                        </div>

                        {profileData.testimonials && profileData.testimonials.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {profileData.testimonials.map((testimonial) => (
                                    <div key={testimonial.id} className="group bg-[#0f1016] border border-gray-800 p-6 rounded-2xl relative hover:border-[#ff6600]/30 transition-all">
                                        <div className="absolute -top-3 -left-2 text-4xl text-[#ff6600]/20 font-serif">“</div>
                                        <blockquote className="text-gray-300 text-sm italic mb-6 line-clamp-4 relative z-10">
                                            {testimonial.quote}
                                        </blockquote>
                                        <div className="flex items-center justify-between border-t border-gray-800/50 pt-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-700 bg-gray-900">
                                                    {testimonial.authorImageURL ? (
                                                        <img src={testimonial.authorImageURL} alt={testimonial.author} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-700 font-bold text-xs">
                                                            {testimonial.author?.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-white text-xs font-bold">{testimonial.author}</p>
                                                    <p className="text-[10px] text-gray-500 truncate max-w-[120px]">{testimonial.authorTitle}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => openTestimonialForm(testimonial)}
                                                    className="p-1.5 text-gray-500 hover:text-[#ff6600] transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteTestimonial(testimonial.id)}
                                                    className="p-1.5 text-gray-500 hover:text-red-500 transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 bg-[#0f1016]/50 border-2 border-dashed border-gray-800 rounded-2xl text-center">
                                <p className="text-gray-500 italic text-sm">No hay testimonios aún. Los testimonios generan confianza en tus clientes.</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {Array.isArray(pendingTestimonials) && pendingTestimonials.length > 0 && (
                <section className="mt-8">
                    <div className="bg-[#ff6600]/5 border border-[#ff6600]/20 rounded-2xl p-6">
                        <h4 className="text-[#ff6600] font-bold text-sm mb-4 flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff6600] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff6600]"></span>
                            </span>
                            Moderación: Testimonios Pendientes ({pendingTestimonials.length})
                        </h4>
                        <div className="space-y-4">
                            {pendingTestimonials.map((testimonial) => (
                                <div key={testimonial.id} className="bg-[#1a1b26] p-4 rounded-xl border border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex-grow">
                                        <p className="text-gray-300 text-sm italic mb-2">"{testimonial.quote}"</p>
                                        <p className="text-white text-[10px] font-bold">— {testimonial.author} <span className="text-gray-600 font-normal">| {testimonial.authorTitle}</span></p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => handleApproveTestimonial(testimonial)}
                                            className="bg-green-600/10 hover:bg-green-600 text-green-500 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                        >
                                            Aprobar
                                        </button>
                                        <button
                                            onClick={() => handleRejectTestimonial(testimonial.id)}
                                            className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                        >
                                            Rechazar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Sección Archivos Digitales - Solo ULTRA */}
            {profileData?.plan === 'ultra' && (
                <>
                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />
                    <section className="animate-fade-in delay-700 pb-10">
                        <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    </div>
                                    <h3 className="font-bold text-xl text-white">Archivos Digitales</h3>
                                </div>
                                <Button 
                                    onClick={() => {
                                        const newFile = {
                                            id: Date.now().toString(),
                                            title: '',
                                            description: '',
                                            fileURL: '',
                                            fileName: '',
                                            fileType: '',
                                        };
                                        setProfileData(prev => ({ ...prev, digitalFiles: [...(prev.digitalFiles || []), newFile] }));
                                    }} 
                                    className="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 px-6 py-2 text-sm font-bold rounded-xl"
                                >
                                    + Añadir Archivo
                                </Button>
                            </div>

                            <div className="space-y-6">
                                {profileData.digitalFiles && profileData.digitalFiles.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {profileData.digitalFiles.map((file, index) => (
                                            <div key={file.id} className="bg-[#0f1016] border border-gray-800 p-6 rounded-2xl space-y-4 relative group">
                                                <button 
                                                    onClick={async () => {
                                                        if (!user) return;
                                                        const updated = (profileData.digitalFiles || []).filter((_, i) => i !== index);
                                                        setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                                                        await setDoc(doc(db, 'profiles', user.uid), { digitalFiles: updated }, { merge: true });
                                                    }}
                                                    className="absolute top-4 right-4 p-1.5 text-gray-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                                </button>
                                                
                                                <Input
                                                    label="Título del Archivo"
                                                    value={file.title}
                                                    onChange={(e) => {
                                                        const updated = [...(profileData.digitalFiles || [])];
                                                        updated[index] = { ...updated[index], title: e.target.value };
                                                        setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                                                    }}
                                                    placeholder="Ej: Menú de Precios PDF"
                                                    className="bg-[#1a1b26] border-gray-700 text-white"
                                                />
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Cargar Archivo</label>
                                                    <div className="flex items-center gap-3 p-3 bg-[#1a1b26] rounded-xl border border-gray-800">
                                                        <label className="cursor-pointer bg-[#ff6600]/10 hover:bg-[#ff6600]/20 text-[#ff6600] text-[10px] font-bold py-1.5 px-3 rounded-lg transition-all uppercase tracking-tight">
                                                            {file.fileURL ? 'Cambiar' : 'Elegir'}
                                                            <input 
                                                                type="file" 
                                                                className="hidden"
                                                                onChange={async (e) => {
                                                                    if (!user) return;
                                                                    const selectedFile = e.target.files?.[0];
                                                                    if (!selectedFile) return;
                                                                    
                                                                    const storageRef = ref(storage, `digital_files/${user.uid}/${Date.now()}_${selectedFile.name}`);
                                                                    try {
                                                                        await uploadBytes(storageRef, selectedFile);
                                                                        const downloadURL = await getDownloadURL(storageRef);
                                                                        const updated = [...(profileData.digitalFiles || [])];
                                                                        updated[index] = { 
                                                                            ...updated[index], 
                                                                            fileURL: downloadURL,
                                                                            fileName: selectedFile.name,
                                                                            fileType: selectedFile.type,
                                                                            fileSize: selectedFile.size
                                                                        };
                                                                        setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                                                                    } catch (error) {
                                                                        alert(`Error al subir: ${error.message}`);
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                        <span className="text-[10px] text-gray-500 truncate flex-grow italic">
                                                            {file.fileName || 'Ningún archivo seleccionado'}
                                                        </span>
                                                        {file.fileURL && (
                                                            <div className="text-green-500">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 bg-[#0f1016]/30 border border-gray-800 border-dashed rounded-2xl text-center">
                                        <p className="text-gray-600 italic text-sm">No has añadido archivos digitales para descarga.</p>
                                    </div>
                                )}
                                
                                <div className="pt-4 flex justify-end">
                                    <Button 
                                        onClick={async () => {
                                            if (!user) return;
                                            try {
                                                await setDoc(doc(db, 'profiles', user.uid), { digitalFiles: profileData.digitalFiles }, { merge: true });
                                                alert('Configuración de archivos guardada.');
                                            } catch (error) {
                                                console.error(error);
                                            }
                                        }}
                                        className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-8 h-10 border border-gray-700"
                                    >
                                        Guardar Todos los Archivos
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>
                </>
            )}

            {/* Testimonial Form Modal */}
            {isTestimonialFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#1a1b26] border border-gray-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-white font-bold text-xl">
                                {editingTestimonial ? 'Editar Testimonio' : 'Nuevo Testimonio'}
                            </h3>
                            <button onClick={closeTestimonialForm} className="text-gray-500 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <Textarea
                                label="La Reseña / Cita"
                                value={testimonialForm.quote}
                                onChange={(e) => setTestimonialForm(prev => ({ ...prev, quote: e.target.value }))}
                                placeholder="Escribe lo que dicen de ti..."
                                className="bg-[#0f1016] border-gray-700 text-white min-h-[120px]"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="Nombre del Autor"
                                    value={testimonialForm.author}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, author: e.target.value }))}
                                    placeholder="Nombre completo"
                                    className="bg-[#0f1016] border-gray-700 text-white"
                                />
                                <Input
                                    label="Cargo / Empresa"
                                    value={testimonialForm.authorTitle}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, authorTitle: e.target.value }))}
                                    placeholder="Ej: CEO en TechCorp"
                                    className="bg-[#0f1016] border-gray-700 text-white"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">Foto del Autor</label>
                                <div className="flex items-center gap-4 p-4 bg-[#0f1016] rounded-2xl border border-gray-800">
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-900 border border-gray-700 flex-shrink-0">
                                        {testimonialForm.authorImageURL ? (
                                            <img src={testimonialForm.authorImageURL} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-700">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                            </div>
                                        )}
                                    </div>
                                    <label className="cursor-pointer bg-[#ff6600]/10 hover:bg-[#ff6600]/20 text-[#ff6600] text-[10px] font-bold py-2 px-4 rounded-lg transition-all uppercase tracking-widest border border-[#ff6600]/20">
                                        Subir Foto
                                        <input type="file" accept="image/*" onChange={handleTestimonialImageUpload} className="hidden" />
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-[#0f1016] border-t border-gray-800 flex gap-3">
                            <Button 
                                onClick={editingTestimonial ? handleUpdateTestimonial : handleAddTestimonial}
                                className="flex-grow bg-[#ff6600] hover:bg-[#ff8533] text-white font-bold h-12 rounded-xl border-none"
                            >
                                {editingTestimonial ? 'Actualizar Testimonio' : 'Publicar Testimonio'}
                            </Button>
                            <Button 
                                variant="secondary" 
                                onClick={closeTestimonialForm}
                                className="bg-gray-800 hover:bg-gray-700 text-white border-none h-12 rounded-xl"
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

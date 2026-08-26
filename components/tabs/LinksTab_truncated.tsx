            {/* Separador Visual Final */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />
            )}
        </div>
                          <div>
                            <label className="block mb-1 text-sm font-medium text-[var(--text-secondary)]">Foto de Portada</label>
                            <div className="flex items-center gap-3">
                              <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors ${isUploadingNewAlbumCover ? 'opacity-50' : ''}`}>
                                {isUploadingNewAlbumCover ? 'Subiendo...' : 'Subir Portada'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleNewAlbumCoverUpload}
                                  className="hidden"
                                  disabled={isUploadingNewAlbumCover}
                                />
                              </label>
                              {newAlbumCoverUrl && (
                                <img src={newAlbumCoverUrl} alt="Portada" className="w-16 h-16 rounded object-cover border border-gray-600" />
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button onClick={handleCreateAlbum} disabled={isUploadingNewAlbumCover || isUploadingAlbumAsset}>
                            Guardar Álbum
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setIsCreatingAlbum(false);
                              setNewAlbumTitle('');
                              setNewAlbumCoverUrl('');
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}

                    {albums.length === 0 ? (
                      <p className="text-gray-500 text-center py-6">No hay álbumes aún.</p>
                    ) : (
                      <div className="space-y-3">
                        {albums.map((album: any) => (
                          <div key={album.id} className="bg-black/20 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              {album.coverImage && (
                                <img src={album.coverImage} alt={album.title} className="w-16 h-16 rounded object-cover border border-gray-600" />
                              )}
                              <div className="min-w-0">
                                {editingAlbumId === album.id ? (
                                  <div className="space-y-3">
                                    <Input
                                      label="Título"
                                      value={editingAlbumTitle}
                                      onChange={(e) => setEditingAlbumTitle(e.target.value)}
                                    />

                                    <div>
                                      <div className="text-sm font-semibold mb-2">Fotos del Álbum</div>
                                      {(editingAlbumImages || []).length === 0 ? (
                                        <p className="text-sm text-gray-400">Este álbum no tiene fotos aún.</p>
                                      ) : (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                          {editingAlbumImages.map((imgUrl, index) => (
                                            <div key={`${imgUrl}-${index}`} className="rounded-lg overflow-hidden border border-gray-700 bg-black/20">
                                              <div className="aspect-square">
                                                <img
                                                  src={imgUrl}
                                                  alt={`Foto ${index + 1}`}
                                                  className="w-full h-full object-cover"
                                                />
                                              </div>
                                              <div className="flex items-center justify-between gap-2 p-2">
                                                <div className="flex items-center gap-2">
                                                  {index > 0 && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleMoveImage(index, 'before')}
                                                      className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-gray-700"
                                                      title="Mover antes"
                                                    >
                                                      ⬅️
                                                    </button>
                                                  )}
                                                  {index < editingAlbumImages.length - 1 && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleMoveImage(index, 'after')}
                                                      className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-gray-700"
                                                      title="Mover después"
                                                    >
                                                      ➡️
                                                    </button>
                                                  )}
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => handleRemoveImage(index)}
                                                  className="text-xs px-2 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white"
                                                  title="Eliminar"
                                                >
                                                  🗑️
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="font-semibold truncate">{album.title}</div>
                                )}
                                <div className="text-sm text-gray-400">{(album.images || []).length} fotos</div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {editingAlbumId === album.id ? (
                                <>
                                  <Button
                                    onClick={() => handleSaveEditAlbum(album.id)}
                                    disabled={isUploadingAlbumAsset}
                                  >
                                    Guardar
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={() => {
                                      setEditingAlbumId(null);
                                      setEditingAlbumTitle('');
                                      setEditingAlbumImages([]);
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleStartEditAlbum(album)}
                                >
                                  Editar
                                </Button>
                              )}

                              <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors ${isUploadingAlbumAsset ? 'opacity-50' : ''}`}>
                                Subir Fotos
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleAlbumImageUpload(album.id, e)}
                                  className="hidden"
                                  disabled={isUploadingAlbumAsset}
                                />
                              </label>

                              <label className={`cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors ${isUploadingAlbumAsset ? 'opacity-50' : ''}`}>
                                Cambiar Portada
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleAlbumCoverUpload(album.id, e)}
                                  className="hidden"
                                  disabled={isUploadingAlbumAsset}
                                />
                              </label>

                              <Button
                                variant="secondary"
                                onClick={() => handleDeleteAlbum(album.id)}
                                disabled={isUploadingAlbumAsset}
                              >
                                Eliminar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sección de Video Destacado */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Video Destacado</h3>

                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setVideoInputMode('external')}
                      className={`px-3 py-2 rounded-lg text-sm border transition ${videoInputMode === 'external' ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-300 border-gray-600 hover:bg-white/5'}`}
                    >
                      Enlace Externo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isUltra) return;
                        setVideoInputMode('upload');
                      }}
                      disabled={!isUltra}
                      className={`px-3 py-2 rounded-lg text-sm border transition ${videoInputMode === 'upload' ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-300 border-gray-600 hover:bg-white/5'} ${!isUltra ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Subir Video
                    </button>
                  </div>

                  {videoInputMode === 'external' && (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Input
                            id="featuredVideoURL"
                            name="featuredVideoURL"
                            label="URL del Video Destacado (YouTube/Vimeo)"
                            value={profileData.featuredVideoURL || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, featuredVideoURL: e.target.value }))}
                            placeholder="Pega aquí la URL del video (YouTube/Vimeo)"
                          />
                        </div>
                        <Button onClick={() => {
                          if (user) {
                            setDoc(doc(db, 'profiles', user.uid), { featuredVideoURL: profileData.featuredVideoURL }, { merge: true });
                          }
                        }} className="!px-6">
                          💾 Guardar
                        </Button>
                      </div>
                      <p className="text-sm text-gray-400 mt-2">
                        Introduce la URL de un video de YouTube o Vimeo que se mostrará en tu perfil público.
                      </p>
                    </>
                  )}

                  {videoInputMode === 'upload' && (
                    <>
                      {!isUltra && (
                        <p className="text-sm text-gray-400">
                          Disponible solo para Plan ULTRA.
                        </p>
                      )}
                      {isUltra && (
                        <div className="flex flex-col gap-2">
                          {profileData?.uploadedVideoURL ? (
                            <>
                              <video
                                src={profileData.uploadedVideoURL}
                                controls
                                className="w-full max-w-md rounded-xl shadow-lg aspect-video bg-black"
                              />
                              <Button
                                onClick={handleDeleteUploadedVideo}
                                className="!bg-red-600 hover:!bg-red-700 !text-white w-fit"
                                disabled={uploadingVideo}
                              >
                                🗑️ Eliminar Video Subido
                              </Button>
                              <p className="text-sm text-gray-400">
                                Elimina este video para poder usar un enlace de YouTube/Vimeo.
                              </p>
                            </>
                          ) : (
                            <>
                              <label className={`cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors w-fit ${uploadingVideo ? 'opacity-50' : ''}`}>
                                {uploadingVideo ? `Subiendo... ${uploadProgress}%` : 'Seleccionar Video'}
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={handleVideoUpload}
                                  className="hidden"
                                  disabled={uploadingVideo}
                                />
                              </label>

                              {uploadingVideo && (
                                <div className="w-full max-w-xs">
                                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-purple-500"
                                      style={{ width: `${uploadProgress}%` }}
                                    />
                                  </div>
                                  <div className="text-xs text-gray-400 mt-1">{uploadProgress}%</div>
                                </div>
                              )}

                              <p className="text-sm text-gray-400">
                                Sube un video (máx. 100MB). Se guardará en tu perfil y tendrá prioridad sobre el enlace externo.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Sección de Testimonios - Solo para PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
              <Card>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">Testimonios</h2>
                  <Button onClick={() => openTestimonialForm()} className="!px-4 !py-2">
                    + Añadir Testimonio
                  </Button>
                </div>

                {/* Lista de testimonios */}
                {profileData.testimonials && profileData.testimonials.length > 0 ? (
                  <div className="space-y-4">
                    {profileData.testimonials.map((testimonial) => (
                      <div key={testimonial.id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <blockquote className="text-gray-700 dark:text-gray-300 italic mb-2">
                              "{testimonial.quote}"
                            </blockquote>
                            <div className="flex items-center gap-3">
                              {testimonial.authorImageURL && (
                                <img
                                  src={testimonial.authorImageURL}
                                  alt={testimonial.author}
                                  className="w-8 h-8 rounded-full object-cover"
                                                                  />
                              )}
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">{testimonial.author}</p>
                                {testimonial.authorTitle && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400">{testimonial.authorTitle}</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              onClick={() => openTestimonialForm(testimonial)}
                              variant="secondary"
                              className="!px-3 !py-1 !text-xs"
                            >
                              ✏️ Editar
                            </Button>
                            <Button
                              onClick={() => handleDeleteTestimonial(testimonial.id)}
                              variant="secondary"
                              className="!px-3 !py-1 !text-xs !bg-red-600 hover:!bg-red-700"
                            >
                              🗑️ Eliminar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No hay testimonios aún. ¡Añade el primero!
                  </p>
                )}
              </Card>
            )}

            {/* Sección Testimonios Pendientes */}
            {/* {console.log('Checking pending testimonials:', pendingTestimonials)} */}
            {Array.isArray(pendingTestimonials) && pendingTestimonials.length > 0 && (
              <Card>
                <h3 className="text-xl font-semibold text-orange-400 mb-4">Testimonios Pendientes ({pendingTestimonials.length})</h3>
                <div className="space-y-4">
                  {pendingTestimonials.map((testimonial) => (
                    <div key={testimonial.id} className="bg-gray-700 p-4 rounded-md shadow">
                      <p className="italic text-gray-300">"{testimonial.quote}"</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        - {testimonial.author}
                        {testimonial.authorTitle && <span className="text-gray-400">, {testimonial.authorTitle}</span>}
                      </p>
                      <div className="mt-3 flex justify-end space-x-2">
                        <button
                          onClick={() => handleRejectTestimonial(testimonial.id)}
                          className="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => handleApproveTestimonial(testimonial)}
                          className="px-3 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white"
                        >
                          Aprobar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Sección Archivos Digitales - Solo ULTRA */}
            {profileData?.plan === 'ultra' && (
              <Card>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">Archivos Digitales</h2>
                  <Button onClick={() => {
                    const newFile = {
                      id: Date.now().toString(),
                      title: '',
                      description: '',
                      fileURL: '',
                      fileName: '',
                      fileType: '',
                    };
                    setProfileData(prev => ({ ...prev, digitalFiles: [...(prev.digitalFiles || []), newFile] }));
                  }} className="!px-4 !py-2">
                    + Añadir Archivo
                  </Button>
                </div>

                {profileData.digitalFiles && profileData.digitalFiles.length > 0 ? (
                  <div className="space-y-4">
                    {profileData.digitalFiles.map((file, index) => (
                      <div key={file.id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border space-y-3">
                        <Input
                          label="Título del Archivo *"
                          value={file.title}
                          onChange={(e) => {
                            const updated = [...(profileData.digitalFiles || [])];
                            updated[index] = { ...updated[index], title: e.target.value };
                            setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                          }}
                          placeholder="Ej: Catálogo de Productos 2024"
                        />
                        <Input
                          label="Descripción"
                          value={file.description || ''}
                          onChange={(e) => {
                            const updated = [...(profileData.digitalFiles || [])];
                            updated[index] = { ...updated[index], description: e.target.value };
                            setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                          }}
                          placeholder="Breve descripción del archivo"
                        />
                        <div>
                          <label className="block text-sm mb-1">Archivo</label>
                          <input 
                            type="file" 
                            onChange={async (e) => {
                              console.log('[Debug] Digital file upload triggered.');
                              if (!user) {
                                  console.error('[Debug] User not found.');
                                  return;
                              }
                              const file = e.target.files?.[0];
                              if (!file) {
                                  console.log('[Debug] No file selected.');
                                  return;
                              }

                              console.log(`[Debug] File selected:`, file.name, file.type);

                              const storageRef = ref(storage, `digital_files/${user.uid}/${Date.now()}_${file.name}`);
                              try {
                                  console.log('[Debug] Uploading digital file to Firebase Storage...');
                                  await uploadBytes(storageRef, file);
                                  const downloadURL = await getDownloadURL(storageRef);
                                  console.log(`[Debug] Digital file uploaded. Download URL: ${downloadURL}`);

                                  const updated = [...(profileData.digitalFiles || [])];
                                  updated[index] = { 
                                    ...updated[index], 
                                    fileURL: downloadURL,
                                    fileName: file.name,
                                    fileType: file.type,
                                    fileSize: file.size
                                  };
                                  setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                                  console.log('[Debug] Digital files state updated.');
                              } catch (error) {
                                  console.error('[Debug] Error during digital file upload:', error);
                                  alert(`Error al subir el archivo: ${error.message}`);
                              }
                            }}
                            className="text-sm"
                          />
                          {file.fileName && (
                            <p className="text-xs text-gray-500 mt-1">📄 {file.fileName}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              if (!user) return;
                              const updated = profileData.digitalFiles?.filter((_, i) => i !== index) || [];
                              setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                              await setDoc(doc(db, 'profiles', user.uid), { digitalFiles: updated }, { merge: true });
                            }}
                            className="!px-3 !py-1 !text-xs !bg-red-600 hover:!bg-red-700"
                          >
                            🗑️ Eliminar
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              if (!user) return;
                              await setDoc(doc(db, 'profiles', user.uid), { digitalFiles: profileData.digitalFiles }, { merge: true });
                            }}
                            className="!px-3 !py-1 !text-xs"
                          >
                            💾 Guardar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No hay archivos digitales aún. ¡Añade el primero!
                  </p>
                )}
              </Card>
            )}

            {/* Sección Preguntas Frecuentes - Solo ULTRA */}
            {profileData?.plan === 'ultra' && (
              <Card>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">Preguntas Frecuentes (FAQs)</h2>
                  <Button onClick={() => {
                    const newFaq = {
                      id: Date.now().toString(),
                      question: '',
                      answer: '',
                      order: (profileData.faqs?.length || 0)
                    };
                    setProfileData(prev => ({ ...prev, faqs: [...(prev.faqs || []), newFaq] }));
                  }} className="!px-4 !py-2">
                    + Añadir FAQ
                  </Button>
                </div>

                {profileData.faqs && profileData.faqs.length > 0 ? (
                  <div className="space-y-4">
                    {profileData.faqs.map((faq, index) => (
                      <div key={faq.id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border space-y-3">
                        <Input
                          label="Pregunta *"
                          value={faq.question}
                          onChange={(e) => {
                            const updated = [...(profileData.faqs || [])];
                            updated[index] = { ...updated[index], question: e.target.value };
                            setProfileData(prev => ({ ...prev, faqs: updated }));
                          }}
                          placeholder="¿Cuál es tu pregunta?"
                        />
                        <Textarea
                          label="Respuesta *"
                          value={faq.answer}
                          onChange={(e) => {
                            const updated = [...(profileData.faqs || [])];
                            updated[index] = { ...updated[index], answer: e.target.value };
                            setProfileData(prev => ({ ...prev, faqs: updated }));
                          }}
                          placeholder="Escribe la respuesta aquí..."
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              if (!user) return;
                              const updated = profileData.faqs?.filter((_, i) => i !== index) || [];
                              setProfileData(prev => ({ ...prev, faqs: updated }));
                              await setDoc(doc(db, 'profiles', user.uid), { faqs: updated }, { merge: true });
                            }}
                            className="!px-3 !py-1 !text-xs !bg-red-600 hover:!bg-red-700"
                          >
                            🗑️ Eliminar
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              if (!user) return;
                              await setDoc(doc(db, 'profiles', user.uid), { faqs: profileData.faqs }, { merge: true });
                            }}
                            className="!px-3 !py-1 !text-xs"
                          >
                            💾 Guardar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No hay preguntas frecuentes aún. ¡Añade la primera!
                  </p>
                )}
              </Card>
            )}
            
            {/* Sección Organizar Secciones del Perfil */}
            <Card>
                <h2 className="text-2xl font-bold mb-6">Organizar Secciones del Perfil</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Arrastra y suelta para reorganizar el orden de las secciones en tu perfil público. Desmarca las secciones que no quieras mostrar.
                </p>
                
                {profileData.sectionOrder && profileData.sectionOrder.length > 0 ? (
                  <div className="space-y-2">
                    {profileData.sectionOrder
                      ?.slice()
                      .sort((a, b) => a.order - b.order)
                      .filter(section => {
                        if (['files', 'faqs'].includes(section.type) && profileData?.plan !== 'ultra') {
                          return false;
                        }
                        return true;
                      })
                      .map((section, index) => {
                        const sectionLabels = {
                          video: 'Video Destacado',
                          links: 'Mis Enlaces',
                          products: 'Productos/Servicios',
                          gallery: 'Galería',
                          files: 'Archivos Digitales',
                          testimonials: 'Testimonios',
                          faqs: 'Preguntas Frecuentes',
                          schedule: 'Horarios de Atención'
                        };
                        
                        return (
                          <div 
                            key={section.type} 
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => {
                                    if (index === 0) return;
                                    const updated = [...profileData.sectionOrder];
                                    const temp = updated[index].order;
                                    updated[index].order = updated[index - 1].order;
                                    updated[index - 1].order = temp;
                                    setProfileData(prev => ({ ...prev, sectionOrder: updated }));
                                  }}
                                  disabled={index === 0}
                                  className="text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => {
                                    if (index === profileData.sectionOrder.length - 1) return;
                                    const updated = [...profileData.sectionOrder];
                                    const temp = updated[index].order;
                                    updated[index].order = updated[index + 1].order;
                                    updated[index + 1].order = temp;
                                    setProfileData(prev => ({ ...prev, sectionOrder: updated }));
                                  }}
                                  disabled={index === profileData.sectionOrder.length - 1}
                                  className="text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  ▼
                                </button>
                              </div>
                              
                              <span className="font-medium">{sectionLabels[section.type] || section.type}</span>
                            </div>
                            
                            <ToggleSwitch
                              checked={section.enabled}
                              onChange={() => {
                                const updated = profileData.sectionOrder.map(s => 
                                  s.type === section.type ? { ...s, enabled: !s.enabled } : s
                                );
                                setProfileData(prev => ({ ...prev, sectionOrder: updated }));
                              }}
                            />
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No hay configuración de secciones disponible.
                  </p>
                )}
                
                <div className="mt-6">
                  <Button onClick={async () => {
                    if (!user) return;
                    await setDoc(doc(db, 'profiles', user.uid), { sectionOrder: profileData.sectionOrder }, { merge: true });
                  }}>
                    💾 Guardar Orden de Secciones
                  </Button>
                </div>
            </Card>

            {/* Modal del Formulario de Testimonios */}
            {isTestimonialFormOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold">
                                    {editingTestimonial ? 'Editar Testimonio' : 'Añadir Testimonio'}
                                </h3>
                                <button
                                    onClick={closeTestimonialForm}
                                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Cita/Testimonio */}
                                <Textarea
                                    id="testimonial-quote"
                                    label="Cita/Testimonio *"
                                    value={testimonialForm.quote}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, quote: e.target.value }))}
                                    placeholder="Escribe la cita o testimonio aquí..."
                                    required
                                />

                                {/* Autor */}
                                <Input
                                    id="testimonial-author"
                                    label="Autor *"
                                    type="text"
                                    value={testimonialForm.author}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, author: e.target.value }))}
                                    placeholder="Nombre del autor"
                                    required
                                />

                                {/* Cargo/Título del Autor */}
                                <Input
                                    id="testimonial-authorTitle"
                                    label="Cargo/Título del Autor"
                                    type="text"
                                    value={testimonialForm.authorTitle}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, authorTitle: e.target.value }))}
                                    placeholder="Ej: CEO, Desarrollador, Cliente..."
                                />

                                {/* Foto del Autor */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Foto del Autor
                                    </label>
                                    <div className="flex items-center gap-4">
                                        {testimonialForm.authorImageURL && (
                                            <img
                                                src={testimonialForm.authorImageURL}
                                                alt="Vista previa"
                                                className="w-16 h-16 rounded-full object-cover border"
                                                onError={undefined}
                                            />
                                        )}
                                        <label className="cursor-pointer bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors">
                                            📷 Subir Foto
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleTestimonialImageUpload}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <Button onClick={closeTestimonialForm} variant="secondary">
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={editingTestimonial ? handleUpdateTestimonial : handleAddTestimonial}
                                    className="!px-6"
                                >
                                    {editingTestimonial ? '💾 Actualizar' : '💾 Guardar'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
